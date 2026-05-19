#!/usr/bin/env bash
# Pull origin/main without leaving the index in an unmerged state.
#
# The four runtime artifacts below are regenerated and committed every hour by
# the VPS trader, so origin always has the freshest version. When `git pull
# --rebase --autostash` runs locally with these files dirty, the autostash pop
# conflicts on the same lines the upstream scan+trade commit just touched and
# leaves the index with UU entries even though the rebase already finished.
#
# Discard local-only edits to those paths first; any other tracked-file edits
# the user is working on still flow through --autostash as normal.
set -euo pipefail

ROLLING_ARTIFACTS=(
  data/daily-macro.csv
  data/daily-valuations.csv
  relative-value/cross_venue_relative_value.csv
  relative-value/index.html
  relative-value/latest.json
)

dirty=()
for path in "${ROLLING_ARTIFACTS[@]}"; do
  if [[ -e "$path" ]] && ! git diff --quiet -- "$path"; then
    dirty+=("$path")
  fi
done

if (( ${#dirty[@]} > 0 )); then
  echo "Discarding local-only changes to rolling runtime artifacts before pull:"
  printf '  - %s\n' "${dirty[@]}"
  git checkout HEAD -- "${dirty[@]}"
fi

git pull --rebase --autostash "$@"
