# Third-party code

Pinned package versions and integrity hashes are in package-lock.json.

* pdf-lib 1.17.1, MIT: app/vendor/pdf-lib.js; upstream license preserved as app/vendor/pdf-lib.LICENSE.md. Source: https://github.com/Hopding/pdf-lib.
* @pdf-lib/fontkit 1.1.1, MIT according to the published package and upstream README: app/vendor/fontkit.js uses the self-contained UMD build with an ESM export wrapper. Upstream README is preserved as app/vendor/fontkit.README.md. The published package and upstream repository do not supply a separate LICENSE file. Source: https://github.com/Hopding/fontkit, derived from https://github.com/foliojs/fontkit. Embedded dependency notices in the distributed bundle are retained.
* Noto Sans Regular: app/fonts/NotoSans-Regular.ttf and the upstream SIL Open Font License in app/fonts/OFL.txt. Source: https://github.com/notofonts/noto-fonts.
* PGlite 0.5.8 and Playwright 1.62.1 are development-only dependencies. Neither is loaded by the deployed browser application. Their package notices remain in installed dependencies.

To reproduce the fontkit wrapper, copy node_modules/@pdf-lib/fontkit/dist/fontkit.umd.js, change the outer invocation from this to globalThis, then append `const fontkit = globalThis.fontkit; export default fontkit;`. Do not use the ES build with an unresolved bare pako import in the static browser application.
