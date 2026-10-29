// Build version, shown after "M sound" in the HUD.
// `git archive` (deploy/loop.sh) fills in the describe string via .gitattributes export-subst:
//   on a release tag  'v0.0.3'             -> '0.0.3'
//   past a tag        'v0.0.3-69-gde03263' -> '0.0.4-dev' (the next patch release, in development)
// Served straight from a working tree (no substitution) it reads 'dev'.
const D = '$Format:%(describe:tags)$';
const m = /^v?(\d+)\.(\d+)\.(\d+)(-\d+-g[0-9a-f]+)?$/.exec(D);
export const VERSION = !m ? 'dev' : m[4] ? `${m[1]}.${m[2]}.${+m[3] + 1}-dev` : `${m[1]}.${m[2]}.${m[3]}`;
