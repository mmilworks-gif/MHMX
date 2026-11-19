#!/usr/bin/env bash
# Atualiza o overview de meters no padrão de console digital, gera os instaladores
# Windows e publica a release no GitHub. Não armazena nem recebe token diretamente.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-1.13.4}"
REPO="mmilworks-gif/MHMX"
export VERSION ROOT REPO

cd "$ROOT"
command -v node >/dev/null || { echo "Node.js não encontrado." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm não encontrado." >&2; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI (gh) não encontrado." >&2; exit 1; }
command -v zip >/dev/null || { echo "zip não encontrado." >&2; exit 1; }

gh auth status >/dev/null 2>&1 || { echo "Faça login antes: gh auth login" >&2; exit 1; }

python3 - <<'PY'
import json, os, re
from pathlib import Path

root = Path(os.environ['ROOT'])
version = os.environ['VERSION']
app = root / 'renderer/app.js'
css = root / 'renderer/style.css'

s = app.read_text()
if 'function renderMeterOverview()' not in s:
    marker = 'function renderMeterPage() {'
    pos = s.index(marker)
    fn = r'''function overviewBars(values, unavailable = false) {
  if (unavailable) return '<span class="ovna">OSC sem leitura</span>';
  return values.map(v => `<i style="height:${meterPct(Number.isFinite(v) ? v : 0)}%;background:${meterColor(Number.isFinite(v) ? v : 0)}"></i>`).join('');
}
function overviewBlock(label, values, view, unavailable = false) {
  const b = document.createElement('button'); b.className = 'ovblock' + (unavailable ? ' unavailable' : '');
  b.innerHTML = `<strong>${label}</strong><span class="ovbars">${overviewBars(values, unavailable)}</span><small>${unavailable ? 'sem telemetria direta' : 'abrir detalhes'}</small>`;
  if (!unavailable) b.onclick = () => { meterView = view; renderMeterPage(); document.querySelectorAll('.meterTabs button').forEach(x => x.classList.toggle('on', x.dataset.view === view)); };
  return b;
}
function renderMeterOverview() {
  const host = $('#meterOverview'); if (!host) return; host.innerHTML = '';
  const add = (label, values, view, unavailable) => host.appendChild(overviewBlock(label, values, view, unavailable));
  add('CH 1–8', meterLevels.slice(0, 8), 'inputs', false);
  add('CH 9–16', meterLevels.slice(8, 16), 'inputs', false);
  add('CH 17–24', meterLevels.slice(16, 24), 'inputs2', false);
  add('CH 25–32', meterLevels.slice(24, 32), 'inputs2', false);
  add('AUX 1–8', meterLevels.slice(32, 40), 'aux', false);
  add('BUS 1–8', meterOutputs.slice(0, 8), 'buses', false);
  add('BUS 9–16', meterOutputs.slice(8, 16), 'buses', false);
  add('DCA 1–8', [], 'main', true);
  add('DCA 9–16', [], 'main', true);
  add('MAIN', meterOutputs.slice(22, 25), 'main', false);
  add('MTX 1–6', meterOutputs.slice(16, 22), 'main', false);
}
'''
    s = s[:pos] + fn + s[pos:]

s = s.replace("  const host = $('#meterGrid'); if (!host) return; host.innerHTML = '';", "  const host = $('#meterGrid'); if (!host) return; host.innerHTML = ''; renderMeterOverview();")
start = s.index('function buildMeters() {')
end = s.index('\nfunction buildRight()', start)
new_build = r'''function buildMeters() {
  const rt = special('Meter');
  rt.innerHTML = `<div class="meterHead"><div><h2>Meter / overview</h2><p>Visão geral no padrão de console digital. Clique em um grupo para abrir os meters detalhados.</p></div><div class="meterLegend"><span class="lg green"></span> normal <span class="lg orange"></span> -20 dB <span class="lg red"></span> -6 dB</div></div><div id="meterOverview" class="meterOverview"></div><div class="meterTabs"></div><div id="meterGrid" class="meterGrid"></div>`;
  const tabs = [['inputs', 'Inputs 1–16'], ['inputs2', 'Inputs 17–32'], ['aux', 'Aux / FX'], ['buses', 'Mix Bus 1–16'], ['main', 'Main / Mono']];
  const bar = rt.querySelector('.meterTabs'); tabs.forEach(([k, t]) => { const b = document.createElement('button'); b.dataset.view = k; b.textContent = t; b.className = k === meterView ? 'on' : ''; b.onclick = () => { meterView = k; bar.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); renderMeterPage(); }; bar.appendChild(b); });
  renderMeterPage();
}'''
s = s[:start] + new_build + s[end:]
app.write_text(s)

c = css.read_text()
if '.meterOverview{' not in c:
    c += r'''

/* Overview inspirado em consoles digitais / Mixing Station */
.meterOverview{display:grid;grid-template-columns:repeat(6,minmax(105px,1fr));gap:5px;margin:4px 0 12px;padding:6px;background:#15181d;border:1px solid #3c424b}
.ovblock{min-height:72px;background:linear-gradient(#343943,#252a31);border:1px solid #59616d;border-radius:2px;padding:5px 4px;display:flex;flex-direction:column;align-items:stretch;gap:4px;text-align:center;color:#e9edf2}.ovblock:hover{background:#3c4650;border-color:#35e0e0}.ovblock strong{font-size:10px;letter-spacing:.2px}.ovblock small{font-size:9px;color:#aab4c0}.ovbars{height:28px;display:flex;align-items:flex-end;justify-content:center;gap:2px;background:#0a0c0f;border:1px solid #20252b;padding:2px}.ovbars i{display:block;width:8px;min-height:1px;background:#35c759}.ovblock.unavailable{opacity:.58;cursor:default}.ovblock.unavailable:hover{background:linear-gradient(#343943,#252a31);border-color:#59616d}.ovna{font-size:9px;color:#d39b68;align-self:center;margin:auto}.meterTabs button[data-view].on{background:#0e4a52;border-color:#35e0e0;color:#fff}
@media (max-width:1200px){.meterOverview{grid-template-columns:repeat(4,minmax(105px,1fr))}}
'''
css.write_text(c)

for name in ('package.json', 'package-lock.json'):
    p = root / name
    data = json.loads(p.read_text())
    if name == 'package.json': data['version'] = version
    else: data['version'] = version
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
PY

node --check renderer/app.js
node --check main.js
node --check preload.js
git diff --check

npm install --package-lock-only >/tmp/mhmx-update-lock.log 2>&1
npm ci >/tmp/mhmx-update-install.log 2>&1

rm -rf dist
export WINEPREFIX="${WINEPREFIX:-$HOME/.wine-mhmx32}"
export WINEARCH="${WINEARCH:-win32}"
export WINEDEBUG="${WINEDEBUG:--all}"
npm run dist >/tmp/mhmx-update-build.log 2>&1

OUT="$ROOT/../MHMX-meter-overview-$VERSION"
rm -rf "$OUT" "$ROOT/../MHMX-meter-overview-$VERSION.zip"
mkdir -p "$OUT/release"
cp "dist/My-House-Mx-Setup-$VERSION.exe" "$OUT/release/"
cp "dist/My-House-Mx-Setup-$VERSION.exe.blockmap" "$OUT/release/"
cp "dist/My-House-Mx-Portable-$VERSION.exe" "$OUT/release/"
cp dist/latest.yml "$OUT/release/"
cat > "$OUT/RELEASE-NOTES-$VERSION.md" <<EOF
# My House Mx $VERSION — overview de meters

- Overview inspirado no layout de consoles digitais e Mixing Station.
- Blocos CH 1–8, CH 9–16, CH 17–24, CH 25–32, AUX, BUS, DCA, MAIN e MTX.
- Clique nos grupos com telemetria para abrir os meters detalhados.
- Meters com escala, peak hold e cores verde/laranja/vermelho.
- DCA aparece identificado, mas sem leitura inventada quando não há telemetria OSC direta.
EOF
sha256sum "$OUT/release"/* > "$OUT/SHA256SUMS.txt"
(cd "$ROOT/.." && zip -qr "MHMX-meter-overview-$VERSION.zip" "MHMX-meter-overview-$VERSION")

git add renderer/app.js renderer/style.css package.json package-lock.json scripts/update-meter-overview.sh
git commit -m "Add digital console meter overview" -m "Co-authored-by: Manus <dev-agent@manus.ai>"
git push origin main
if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
  echo "A tag v$VERSION já existe; não será sobrescrita." >&2
  exit 1
fi
git tag -a "v$VERSION" -m "My House Mx $VERSION"
git push origin "v$VERSION"
gh release create "v$VERSION" \
  "$OUT/release/My-House-Mx-Setup-$VERSION.exe" \
  "$OUT/release/My-House-Mx-Setup-$VERSION.exe.blockmap" \
  "$OUT/release/My-House-Mx-Portable-$VERSION.exe" \
  "$OUT/release/latest.yml" \
  "$OUT/SHA256SUMS.txt" \
  --verify-tag --title "My House Mx $VERSION" --notes-file "$OUT/RELEASE-NOTES-$VERSION.md"

echo "Release publicada: https://github.com/$REPO/releases/tag/v$VERSION"
