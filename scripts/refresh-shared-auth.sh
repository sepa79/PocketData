#!/usr/bin/env bash
set -euo pipefail
source_root="$(realpath "${1:?Usage: refresh-shared-auth.sh PH_SOURCE}")"
product_root="$(cd "$(dirname "$0")/.." && pwd)"
version="$(sed -n 's|.*<pockethive.auth.version>\([^<]*\)</pockethive.auth.version>.*|\1|p' "$product_root/pom.xml")"
test -n "$version"
mvn -f "$source_root/pom.xml" -pl common/auth-client -am -Drevision="$version" -DskipTests install
repository="$product_root/vendor/maven/io/pockethive"
for artifact in pockethive-mvp auth-contracts auth-client; do
  destination="$repository/$artifact/$version"
  mkdir -p "$destination"
  if [[ "$artifact" == pockethive-mvp ]]; then
    artifact_root="$source_root"
  else
    artifact_root="$source_root/common/$artifact"
    install -m 644 "$artifact_root/target/$artifact-$version.jar" "$destination/$artifact-$version.jar"
  fi
  install -m 644 "$artifact_root/.flattened-pom.xml" "$destination/$artifact-$version.pom"
  for artifact_file in "$destination"/*.pom "$destination"/*.jar; do
    [[ -f "$artifact_file" ]] || continue
    sha1sum "$artifact_file" | cut -d ' ' -f1 > "$artifact_file.sha1"
  done
done
cd "$product_root/vendor/maven"
find io -type f ! -name '*.sha1' -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
