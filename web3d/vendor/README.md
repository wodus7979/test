# vendor

`three.bundle.js` — Three.js r185 + 몇 가지 애드온(EffectComposer, RenderPass,
ShaderPass, UnrealBloomPass, OutputPass, FXAAShader, Sky, BufferGeometryUtils)을
하나의 클래식 스크립트로 묶어 둔 것입니다. `window.THREE` 로 노출됩니다.

여기에 넣어 두는 이유는 **빌드에 npm 이 필요 없게** 하기 위해서입니다.
`node build3d.js` 만 하면 이 파일이 통째로 HTML 안에 들어갑니다.

다시 만들려면:

```bash
npm pack three@0.185.1 && tar xzf three-*.tgz
npm i esbuild
cat > entry.js <<'JS'
import * as THREE from './package/build/three.module.min.js';
import { EffectComposer } from './package/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './package/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from './package/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './package/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './package/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from './package/examples/jsm/shaders/FXAAShader.js';
import { Sky } from './package/examples/jsm/objects/Sky.js';
import * as BufferGeometryUtils from './package/examples/jsm/utils/BufferGeometryUtils.js';
window.THREE = Object.assign({}, THREE, { EffectComposer, RenderPass, ShaderPass,
  UnrealBloomPass, OutputPass, FXAAShader, Sky, BufferGeometryUtils });
JS
npx esbuild entry.js --bundle --format=iife --minify --target=es2020 --outfile=three.bundle.js
```

라이선스는 `three.LICENSE` (MIT).
