#!/bin/sh
# pbe holds nothing of its own: each commit on it is a merge of build, patch, minor or major.
#   pbe-check.sh          a commit on pbe, refused unless it concludes a merge (pre-commit)
#   pbe-check.sh <range>  every first-parent commit of <range> (pre-push, idle deploy pbe)
released() {
	for b in $(git for-each-ref --format='%(refname)' refs/heads/build refs/heads/patch refs/heads/minor \
		refs/heads/major refs/remotes/origin/build refs/remotes/origin/patch refs/remotes/origin/minor refs/remotes/origin/major); do
		git merge-base --is-ancestor "$1" "$b" && return 0
	done
	echo "pbe: $(git log -1 --format='%h %s' "$1") is on no version branch (build, patch, minor, major). Merge it there first, then merge that branch into pbe." >&2
	return 1
}

if [ $# -eq 0 ]; then
	[ "$(git symbolic-ref -q --short HEAD)" = pbe ] || exit 0
	merge=$(git rev-parse --git-path MERGE_HEAD)
	[ -f "$merge" ] || { echo 'pbe: no commits of its own. Commit on a branch off build, then merge a version branch into pbe.' >&2; exit 1; }
	for c in $(cat "$merge"); do released "$c" || exit 1; done
	exit 0
fi

commits=$(git rev-list --first-parent "$1") || exit 1
for c in $commits; do
	parents=$(git rev-list --parents -n 1 "$c" | cut -d' ' -f3-)
	[ -n "$parents" ] || { echo "pbe: $(git log -1 --format='%h %s' "$c") is not a merge. pbe takes only merges of version branches." >&2; exit 1; }
	for p in $parents; do released "$p" || exit 1; done
done
