using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>
    /// 외부 에셋 없이 동작하기 위해 텍스처, 머티리얼, 사운드를 코드로 생성한다.
    /// </summary>
    public static class ProceduralAssets
    {
        public static bool IsUrp => GraphicsSettings.currentRenderPipeline != null;

        static Font _font;
        public static Font UiFont
        {
            get
            {
                if (_font != null) return _font;
                _font = LoadBuiltinFont("LegacyRuntime.ttf");
                if (_font == null) _font = LoadBuiltinFont("Arial.ttf");
                return _font;
            }
        }

        static Font LoadBuiltinFont(string name)
        {
            try { return Resources.GetBuiltinResource<Font>(name); }
            catch { return null; }
        }

        // ---------- 머티리얼 ----------

        static Shader _defaultLit;

        /// <summary>
        /// 빌드에 반드시 포함되는 기본 프리미티브 머티리얼의 셰이더(Standard 또는 URP Lit).
        /// Shader.Find 는 빌드에서 스트리핑된 셰이더를 찾지 못하므로 이쪽을 우선 사용한다.
        /// </summary>
        public static Shader DefaultLitShader
        {
            get
            {
                if (_defaultLit != null) return _defaultLit;
                var probe = GameObject.CreatePrimitive(PrimitiveType.Cube);
                var r = probe.GetComponent<Renderer>();
                if (r != null && r.sharedMaterial != null) _defaultLit = r.sharedMaterial.shader;
                Object.Destroy(probe);
                if (_defaultLit == null) _defaultLit = IsUrp ? Shader.Find("Universal Render Pipeline/Lit") : Shader.Find("Standard");
                return _defaultLit;
            }
        }

        public static Material LitMaterial(Color color, float smoothness = 0.15f)
        {
            Shader shader = DefaultLitShader;
            if (shader == null) shader = Shader.Find("Standard");
            var m = new Material(shader);
            m.color = color;
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smoothness);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            return m;
        }

        public static Material UnlitMaterial(Color color)
        {
            Shader shader = IsUrp ? Shader.Find("Universal Render Pipeline/Unlit") : Shader.Find("Unlit/Color");
            if (shader == null) shader = Shader.Find("Sprites/Default");
            if (shader == null) shader = DefaultLitShader;
            var m = new Material(shader);
            m.color = color;
            return m;
        }

        // ---------- 텍스처 ----------

        public static Texture2D NoiseTexture(int size, Color a, Color b, float scale, float seed)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, true);
            var pixels = new Color[size * size];
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float fx = (float)x / size, fy = (float)y / size;
                    float n = Mathf.PerlinNoise(fx * scale + seed, fy * scale + seed) * 0.6f
                            + Mathf.PerlinNoise(fx * scale * 4f + seed * 2f, fy * scale * 4f) * 0.3f
                            + Mathf.PerlinNoise(fx * scale * 16f, fy * scale * 16f + seed) * 0.1f;
                    pixels[y * size + x] = Color.Lerp(a, b, n);
                }
            }
            tex.SetPixels(pixels);
            tex.wrapMode = TextureWrapMode.Repeat;
            tex.Apply(true);
            return tex;
        }

        /// <summary>조준경 오버레이: 원 밖은 검정, 안쪽은 십자선 + 밀닷 + 가장자리 비네트.</summary>
        public static Texture2D ScopeOverlay(int size = 1024)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            var px = new Color[size * size];
            float c = size * 0.5f;
            float radius = size * 0.47f;
            float line = size * 0.0015f;
            float dotStep = radius * 0.1f;
            var black = new Color(0f, 0f, 0f, 1f);

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float dx = x - c + 0.5f, dy = y - c + 0.5f;
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    Color col;
                    if (d > radius)
                    {
                        col = black;
                    }
                    else
                    {
                        float ax = Mathf.Abs(dx), ay = Mathf.Abs(dy);
                        bool onLine = ax < line || ay < line;
                        bool post = (ax < line * 3.5f && ay > radius * 0.5f) || (ay < line * 3.5f && ax > radius * 0.5f);
                        bool dot = false;
                        for (int i = 1; i <= 4 && !dot; i++)
                        {
                            float p = i * dotStep;
                            if ((Mathf.Abs(ax - p) < line * 2.4f && ay < line * 2.4f) ||
                                (Mathf.Abs(ay - p) < line * 2.4f && ax < line * 2.4f)) dot = true;
                        }
                        if (onLine || post || dot)
                        {
                            col = black;
                        }
                        else
                        {
                            float edge = Mathf.InverseLerp(radius * 0.84f, radius, d);
                            col = new Color(0f, 0f, 0f, edge * edge * 0.9f);
                        }
                    }
                    px[y * size + x] = col;
                }
            }
            tex.SetPixels(px);
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.Apply(false);
            return tex;
        }

        /// <summary>위쪽을 가리키는 화살표 (바람 표시용).</summary>
        public static Texture2D ArrowTexture(int size = 64)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float fx = (x + 0.5f) / size, fy = (y + 0.5f) / size;
                    bool shaft = Mathf.Abs(fx - 0.5f) < 0.09f && fy > 0.08f && fy < 0.62f;
                    float headT = Mathf.InverseLerp(0.95f, 0.55f, fy);
                    bool head = fy >= 0.55f && fy < 0.95f && Mathf.Abs(fx - 0.5f) < 0.34f * headT;
                    px[y * size + x] = (shaft || head) ? Color.white : new Color(1f, 1f, 1f, 0f);
                }
            }
            tex.SetPixels(px);
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.Apply(false);
            return tex;
        }

        /// <summary>지형 디테일용 풀잎 빌보드 텍스처 (여러 가닥, 알파 있음).</summary>
        public static Texture2D GrassBladeTexture(int w = 64, int h = 128)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, true);
            var px = new Color[w * h];
            var clear = new Color(0.3f, 0.5f, 0.2f, 0f);
            for (int i = 0; i < px.Length; i++) px[i] = clear;

            float[] centers = { 0.18f, 0.34f, 0.5f, 0.66f, 0.82f };
            float[] lean = { -0.10f, 0.06f, 0f, -0.05f, 0.11f };
            float[] tops = { 0.75f, 0.92f, 1.0f, 0.88f, 0.7f };
            for (int b = 0; b < centers.Length; b++)
            {
                for (int y = 0; y < h; y++)
                {
                    float fy = (float)y / h;
                    if (fy > tops[b]) continue;
                    float t = fy / tops[b];
                    float cx = centers[b] + lean[b] * t * t;
                    float halfW = Mathf.Lerp(0.045f, 0.006f, t);
                    float shade = Mathf.Lerp(0.55f, 1.0f, t);
                    for (int x = 0; x < w; x++)
                    {
                        float fx = (x + 0.5f) / w;
                        if (Mathf.Abs(fx - cx) < halfW)
                            px[y * w + x] = new Color(0.35f * shade, 0.62f * shade, 0.22f * shade, 1f);
                    }
                }
            }
            tex.SetPixels(px);
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.Apply(true);
            return tex;
        }

        public static Sprite SpriteFrom(Texture2D tex)
        {
            return Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f));
        }

        // ---------- 사운드 ----------

        const int SampleRate = 44100;

        static AudioClip MakeClip(string name, float seconds, System.Func<float, float> generator)
        {
            int n = Mathf.CeilToInt(seconds * SampleRate);
            var data = new float[n];
            for (int i = 0; i < n; i++)
                data[i] = Mathf.Clamp(generator(i / (float)SampleRate), -1f, 1f);
            var clip = AudioClip.Create(name, n, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        public static AudioClip Gunshot()
        {
            var rng = new System.Random(11);
            return MakeClip("Gunshot", 0.7f, t =>
            {
                float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
                return noise * Mathf.Exp(-t * 18f) * 0.9f
                     + Mathf.Sin(t * 2f * Mathf.PI * 55f) * Mathf.Exp(-t * 9f) * 0.7f;
            });
        }

        public static AudioClip DistantShot()
        {
            var rng = new System.Random(23);
            float last = 0f;
            return MakeClip("DistantShot", 0.9f, t =>
            {
                float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
                last += (noise - last) * 0.08f;
                return last * 4f * Mathf.Exp(-t * 6f)
                     + Mathf.Sin(t * 2f * Mathf.PI * 45f) * Mathf.Exp(-t * 5f) * 0.5f;
            });
        }

        public static AudioClip BulletCrack()
        {
            var rng = new System.Random(37);
            return MakeClip("Crack", 0.25f, t =>
            {
                float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
                return noise * Mathf.Exp(-t * 60f) * 0.8f;
            });
        }

        public static AudioClip Bolt()
        {
            var rng = new System.Random(41);
            return MakeClip("Bolt", 0.4f, t =>
            {
                float a = t < 0.2f ? t : t - 0.2f;
                float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
                return noise * Mathf.Exp(-a * 120f) * 0.6f;
            });
        }

        public static AudioClip HitTick()
        {
            return MakeClip("HitTick", 0.15f, t => Mathf.Sin(t * 2f * Mathf.PI * 1400f) * Mathf.Exp(-t * 35f) * 0.6f);
        }

        public static AudioClip EmptyClick()
        {
            return MakeClip("Click", 0.08f, t => Mathf.Sin(t * 2f * Mathf.PI * 300f) * Mathf.Exp(-t * 90f) * 0.5f);
        }
    }

    public class SoundBank
    {
        public AudioClip Gunshot, DistantShot, Crack, Bolt, HitTick, Click;

        public static SoundBank Create()
        {
            return new SoundBank
            {
                Gunshot = ProceduralAssets.Gunshot(),
                DistantShot = ProceduralAssets.DistantShot(),
                Crack = ProceduralAssets.BulletCrack(),
                Bolt = ProceduralAssets.Bolt(),
                HitTick = ProceduralAssets.HitTick(),
                Click = ProceduralAssets.EmptyClick(),
            };
        }
    }
}
