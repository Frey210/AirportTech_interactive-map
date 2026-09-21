#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly REPOSITORY="git@github.com:Frey210/AirportTech_interactive-map.git"
readonly DEPLOY_ROOT="/opt/airport-maps-deploy"
readonly GIT_DIR="${DEPLOY_ROOT}/repo.git"
readonly RELEASES_DIR="${DEPLOY_ROOT}/releases"
readonly DEPLOY_KEY="/opt/airport-deploy/id_ed25519"
readonly KNOWN_HOSTS="/opt/airport-deploy/known_hosts"
readonly MAPS_DIR="/opt/airport-stack/maps"
readonly APP_CONTAINER="airport-technology"
readonly LAN_URL="http://192.168.10.103:8081/maps/"
readonly TAILSCALE_URL="http://100.90.2.119:8081/maps/"

usage() {
    cat <<'EOF'
Penggunaan:
  sudo deploy-airport-maps                  Pilih branch secara interaktif
  sudo deploy-airport-maps <branch>         Deploy branch secara langsung
  sudo deploy-airport-maps --list           Tampilkan branch remote
  sudo deploy-airport-maps --current        Tampilkan versi aktif
  sudo deploy-airport-maps --help           Tampilkan bantuan
EOF
}

die() {
    echo "ERROR: $*" >&2
    exit 1
}

[[ ${EUID} -eq 0 ]] || die "Jalankan dengan sudo."
for command in docker git ssh tar curl flock; do
    command -v "${command}" >/dev/null || die "Perintah belum tersedia: ${command}"
done
[[ -f "${DEPLOY_KEY}" ]] || die "Deploy key tidak ditemukan: ${DEPLOY_KEY}"
[[ -f "${KNOWN_HOSTS}" ]] || die "known_hosts GitHub tidak ditemukan: ${KNOWN_HOSTS}"
[[ -d "$(dirname "${MAPS_DIR}")" ]] || die "Direktori stack tidak ditemukan."
[[ -d "${MAPS_DIR}" ]] || die "Direktori frontend aktif tidak ditemukan: ${MAPS_DIR}"

mkdir -p "${RELEASES_DIR}"
exec 9>/run/lock/deploy-airport-maps.lock
flock -n 9 || die "Deployment peta lain sedang berjalan."

export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${KNOWN_HOSTS}"
if [[ ! -d "${GIT_DIR}" ]]; then
    git init --bare "${GIT_DIR}" >/dev/null
    git --git-dir="${GIT_DIR}" remote add origin "${REPOSITORY}"
fi
git --git-dir="${GIT_DIR}" fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'

mapfile -t branches < <(git --git-dir="${GIT_DIR}" for-each-ref --format='%(refname:strip=3)' refs/remotes/origin/ | sort)
[[ ${#branches[@]} -gt 0 ]] || die "Branch remote tidak ditemukan."

case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    --list) printf '%s\n' "${branches[@]}"; exit 0 ;;
    --current)
        [[ -f "${DEPLOY_ROOT}/current.env" ]] && cat "${DEPLOY_ROOT}/current.env" || echo "Belum ada deployment tercatat."
        exit 0
        ;;
    '')
        echo "Pilih branch yang akan di-deploy:"
        PS3="Nomor branch (atau q untuk batal): "
        select selected in "${branches[@]}"; do
            [[ ${REPLY} == q ]] && exit 0
            [[ -n "${selected:-}" ]] && branch="${selected}" && break
            echo "Pilihan tidak valid."
        done
        ;;
    *) [[ $# -eq 1 ]] || die "Hanya satu branch yang dapat dipilih."; branch="$1" ;;
esac

git check-ref-format --branch "${branch}" >/dev/null 2>&1 || die "Nama branch tidak valid: ${branch}"
git --git-dir="${GIT_DIR}" show-ref --verify --quiet "refs/remotes/origin/${branch}" || die "Branch remote tidak ditemukan: ${branch}"

commit="$(git --git-dir="${GIT_DIR}" rev-parse "refs/remotes/origin/${branch}^{commit}")"
short_commit="${commit:0:12}"
release_dir="${RELEASES_DIR}/${commit}"
image="airport-technology-maps:${commit}"
timestamp="$(date +%Y%m%d-%H%M%S)"
staged_dir="${MAPS_DIR}.next-${short_commit}"
previous_dir="${MAPS_DIR}.pre-${timestamp}-${short_commit}"
extractor="airport-maps-extract-${short_commit}"

echo "Branch : ${branch}"
echo "Commit : ${commit}"
if [[ ! -d "${release_dir}" ]]; then
    mkdir "${release_dir}"
    git --git-dir="${GIT_DIR}" archive "${commit}" | tar -x -C "${release_dir}"
fi

docker build --label "org.opencontainers.image.revision=${commit}" --label "org.opencontainers.image.source=${REPOSITORY}" --tag "${image}" "${release_dir}"
[[ ! -e "${staged_dir}" ]] || die "Direktori staging sudah ada: ${staged_dir}"
[[ ! -e "${previous_dir}" ]] || die "Direktori rollback sudah ada: ${previous_dir}"
mkdir "${staged_dir}"
docker create --name "${extractor}" "${image}" >/dev/null
trap 'docker rm -f "${extractor}" >/dev/null 2>&1 || true' EXIT
docker cp "${extractor}:/usr/share/nginx/html/maps/." "${staged_dir}/"
docker rm "${extractor}" >/dev/null
[[ -s "${staged_dir}/index.html" ]] || die "Artifact frontend tidak memiliki index.html."

mv -- "${MAPS_DIR}" "${previous_dir}"
mv -- "${staged_dir}" "${MAPS_DIR}"
if ! docker restart "${APP_CONTAINER}" >/dev/null; then
    failed_dir="${MAPS_DIR}.failed-${timestamp}-${short_commit}"
    mv -- "${MAPS_DIR}" "${failed_dir}"
    mv -- "${previous_dir}" "${MAPS_DIR}"
    docker restart "${APP_CONTAINER}" >/dev/null 2>&1 || true
    die "Container gagal restart; frontend sebelumnya telah dipulihkan."
fi

healthy=false
for _ in {1..30}; do
    if curl -fsS "${LAN_URL}" >/dev/null && curl -fsS "${TAILSCALE_URL}" >/dev/null; then
        healthy=true
        break
    fi
    sleep 2
done

if [[ ${healthy} != true ]]; then
    failed_dir="${MAPS_DIR}.failed-${timestamp}-${short_commit}"
    mv -- "${MAPS_DIR}" "${failed_dir}"
    [[ -d "${previous_dir}" ]] && mv -- "${previous_dir}" "${MAPS_DIR}"
    docker restart "${APP_CONTAINER}" >/dev/null
    die "Health check gagal; frontend sebelumnya telah dipulihkan."
fi

cat >"${DEPLOY_ROOT}/current.env" <<EOF
BRANCH=${branch}
COMMIT=${commit}
IMAGE=${image}
DEPLOYED_AT=$(date --iso-8601=seconds)
ROLLBACK_DIR=${previous_dir}
EOF

trap - EXIT
echo "Deployment peta berhasil."
echo "LAN       : ${LAN_URL}"
echo "Tailscale : ${TAILSCALE_URL}"
echo "Rollback  : ${previous_dir}"
