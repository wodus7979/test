using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>코드 생성 지오메트리에 쓰는 표면 종류.</summary>
    public enum Surface
    {
        Fabric,        // 군복, 캔버스, 장갑 천
        PaintedMetal,  // 도장된 강판 (헬기 동체, 방탄판, 총기 리시버)
        Steel,         // 맨 금속, 브러시드 (총열, 볼트, 프레임)
        Rubber,        // 고무, 나일론 장구
        Wood,          // 개머리판, 목재
        Polymer,       // 폴리머 총몸, 플라스틱
        Skin,          // 피부
    }

    /// <summary>
    /// 외부 텍스처 없이 단색 재질에 미세 표면 디테일을 입힌다.
    /// 타일링되는 다중 옥타브 노이즈로 디테일 알베도/노멀 맵을 만들고,
    /// Standard 셰이더의 노멀맵 + 디테일 맵(_DETAIL_MULX2) 슬롯에 연결한다.
    /// 표면 종류별로 텍스처를 한 번만 만들어 모든 재질이 공유한다.
    /// </summary>
    public static class SurfaceDetail
    {
        const int Size = 256;

        struct Recipe
        {
            public Texture2D Albedo, Normal;
            public float Tiling, DetailTiling, BumpScale, DetailScale, Metallic;
        }

        static readonly Dictionary<Surface, Recipe> recipes = new Dictionary<Surface, Recipe>();

        /// <summary>표면 디테일이 있는 Standard 재질. metallic 이 음수면 표면 종류의 기본값을 쓴다.</summary>
        public static Material Make(Surface surface, Color color, float smoothness, float metallic = -1f)
        {
            var m = ProceduralAssets.LitMaterial(color, smoothness);
            var r = Get(surface);
            float metal = metallic < 0f ? r.Metallic : metallic;
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metal);
            if (m.HasProperty("_BumpMap"))
            {
                m.SetTexture("_BumpMap", r.Normal);
                m.SetTextureScale("_BumpMap", new Vector2(r.Tiling, r.Tiling));
                if (m.HasProperty("_BumpScale")) m.SetFloat("_BumpScale", r.BumpScale);
                m.EnableKeyword("_NORMALMAP");
            }
            if (m.HasProperty("_DetailAlbedoMap"))
            {
                m.SetTexture("_DetailAlbedoMap", r.Albedo);
                m.SetTextureScale("_DetailAlbedoMap", new Vector2(r.DetailTiling, r.DetailTiling));
                if (m.HasProperty("_DetailNormalMap")) m.SetTexture("_DetailNormalMap", r.Normal);
                if (m.HasProperty("_DetailNormalMapScale")) m.SetFloat("_DetailNormalMapScale", r.DetailScale);
                if (m.HasProperty("_UVSec")) m.SetFloat("_UVSec", 0f);
                m.EnableKeyword("_DETAIL_MULX2");
            }
            return m;
        }

        static Recipe Get(Surface surface)
        {
            if (recipes.TryGetValue(surface, out var found) && found.Albedo != null) return found;
            var r = Build(surface);
            recipes[surface] = r;
            return r;
        }

        // ---------- 표면별 레시피 ----------

        static Recipe Build(Surface surface)
        {
            var height = new float[Size * Size];
            var shade = new float[Size * Size];
            var r = new Recipe();
            int seed = 100 + (int)surface * 17;
            switch (surface)
            {
                case Surface.Fabric:
                    Fill(height, shade, (u, v) =>
                    {
                        float weave = .5f + .5f * Mathf.Sin(u * Mathf.PI * 2f * 64f) * Mathf.Sin(v * Mathf.PI * 2f * 64f);
                        float fibre = Fbm(u, v, 32, 3, seed);
                        float wear = Fbm(u, v, 3, 4, seed + 7);
                        float h = weave * .55f + fibre * .45f;
                        float s = (fibre - .5f) * .16f + (wear - .5f) * .12f;
                        return new Vector2(h, s);
                    });
                    r.Tiling = 1.5f; r.DetailTiling = 6f; r.BumpScale = .35f; r.DetailScale = .7f; r.Metallic = 0f;
                    r.Normal = NormalMap(height, 1.6f, "Fabric normal");
                    break;
                case Surface.PaintedMetal:
                    Fill(height, shade, (u, v) =>
                    {
                        float blotch = Fbm(u, v, 3, 5, seed);
                        float speck = Fbm(u, v, 48, 2, seed + 3);
                        float scratch = Mathf.Pow(Fbm(u, v * 8f, 6, 3, seed + 11), 6f);
                        float h = blotch * .7f + speck * .3f;
                        float s = (blotch - .5f) * .10f + (speck - .5f) * .05f - scratch * .35f;
                        return new Vector2(h, s);
                    });
                    r.Tiling = .8f; r.DetailTiling = 3f; r.BumpScale = .18f; r.DetailScale = .3f; r.Metallic = .2f;
                    r.Normal = NormalMap(height, .6f, "Painted metal normal");
                    break;
                case Surface.Steel:
                    Fill(height, shade, (u, v) =>
                    {
                        float brushed = Fbm(u, v * 16f, 2, 3, seed);             // 가로로 길게 늘어난 결
                        float pits = Mathf.Pow(Fbm(u, v, 40, 2, seed + 5), 5f);
                        float tarnish = Fbm(u, v, 2, 4, seed + 9);
                        float h = brushed * .6f + (1f - pits) * .4f;
                        float s = (brushed - .5f) * .14f + (tarnish - .5f) * .12f - pits * .3f;
                        return new Vector2(h, s);
                    });
                    r.Tiling = 1f; r.DetailTiling = 4f; r.BumpScale = .25f; r.DetailScale = .45f; r.Metallic = .85f;
                    r.Normal = NormalMap(height, .8f, "Steel normal");
                    break;
                case Surface.Rubber:
                    Fill(height, shade, (u, v) =>
                    {
                        float grain = Fbm(u, v, 56, 2, seed);
                        float dust = Fbm(u, v, 4, 3, seed + 2);
                        float h = grain;
                        float s = (grain - .5f) * .08f + (dust - .5f) * .10f;
                        return new Vector2(h, s);
                    });
                    r.Tiling = 2f; r.DetailTiling = 6f; r.BumpScale = .3f; r.DetailScale = .5f; r.Metallic = 0f;
                    r.Normal = NormalMap(height, 1.2f, "Rubber normal");
                    break;
                case Surface.Wood:
                    Fill(height, shade, (u, v) =>
                    {
                        float turb = Fbm(u, v, 4, 3, seed);
                        float rings = Mathf.Abs(Mathf.Sin((v * 7f + turb * .8f) * Mathf.PI));
                        float grain = Fbm(u, v * 24f, 2, 2, seed + 4);
                        float h = rings * .7f + grain * .3f;
                        float s = (rings - .5f) * .22f + (grain - .5f) * .08f;
                        return new Vector2(h, s);
                    });
                    r.Tiling = 1f; r.DetailTiling = 2f; r.BumpScale = .3f; r.DetailScale = .4f; r.Metallic = 0f;
                    r.Normal = NormalMap(height, .9f, "Wood normal");
                    break;
                case Surface.Polymer:
                    Fill(height, shade, (u, v) =>
                    {
                        float stipple = Fbm(u, v, 64, 2, seed);
                        float wear = Fbm(u, v, 3, 3, seed + 6);
                        float h = stipple;
                        float s = (stipple - .5f) * .07f + (wear - .5f) * .06f;
                        return new Vector2(h, s);
                    });
                    r.Tiling = 2.5f; r.DetailTiling = 8f; r.BumpScale = .35f; r.DetailScale = .55f; r.Metallic = 0f;
                    r.Normal = NormalMap(height, 1.4f, "Polymer normal");
                    break;
                default: // Skin
                    Fill(height, shade, (u, v) =>
                    {
                        float pores = Fbm(u, v, 48, 2, seed);
                        float tone = Fbm(u, v, 3, 3, seed + 8);
                        float h = pores;
                        float s = (pores - .5f) * .05f + (tone - .5f) * .07f;
                        return new Vector2(h, s);
                    });
                    r.Tiling = 3f; r.DetailTiling = 6f; r.BumpScale = .15f; r.DetailScale = .25f; r.Metallic = 0f;
                    r.Normal = NormalMap(height, .7f, "Skin normal");
                    break;
            }
            r.Albedo = DetailAlbedo(shade, surface + " detail");
            return r;
        }

        /// <summary>각 픽셀에 대해 (높이 0..1, 명도 변화 -0.5..0.5) 를 계산한다.</summary>
        static void Fill(float[] height, float[] shade, System.Func<float, float, Vector2> f)
        {
            for (int y = 0; y < Size; y++)
            {
                float v = (y + .5f) / Size;
                for (int x = 0; x < Size; x++)
                {
                    float u = (x + .5f) / Size;
                    var hs = f(u, v);
                    height[y * Size + x] = hs.x;
                    shade[y * Size + x] = hs.y;
                }
            }
        }

        // ---------- 타일링 노이즈 ----------

        static float Hash(int x, int y, int seed)
        {
            unchecked
            {
                int h = x * 374761393 + y * 668265263 + seed * 1274126177;
                h = (h ^ (h >> 13)) * 1274126177;
                h ^= h >> 16;
                return (h & 0x7fffffff) / (float)0x7fffffff;
            }
        }

        /// <summary>격자 주기 period 로 감싸는 값 노이즈. u,v 는 타일 좌표(정수 단위가 한 격자).</summary>
        static float ValueNoise(float u, float v, int period, int seed)
        {
            int xi = Mathf.FloorToInt(u), yi = Mathf.FloorToInt(v);
            float fx = u - xi, fy = v - yi;
            fx = fx * fx * (3f - 2f * fx);
            fy = fy * fy * (3f - 2f * fy);
            int x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
            int x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
            float a = Hash(x0, y0, seed), b = Hash(x1, y0, seed), c = Hash(x0, y1, seed), d = Hash(x1, y1, seed);
            return Mathf.Lerp(Mathf.Lerp(a, b, fx), Mathf.Lerp(c, d, fx), fy);
        }

        /// <summary>u,v 는 0..1 타일 좌표. period 는 첫 옥타브 격자 수. 결과 0..1, 평균 약 0.5.</summary>
        static float Fbm(float u, float v, int period, int octaves, int seed)
        {
            float sum = 0f, amp = 1f, norm = 0f;
            int p = period;
            for (int o = 0; o < octaves; o++)
            {
                sum += amp * ValueNoise(u * p, v * p, p, seed + o * 31);
                norm += amp;
                amp *= .5f;
                p *= 2;
            }
            return sum / norm;
        }

        // ---------- 텍스처 인코딩 ----------

        /// <summary>회색 0.5 가 중립인 디테일 알베도 (sRGB). _DETAIL_MULX2 에서 2배 곱해진다.</summary>
        static Texture2D DetailAlbedo(float[] shade, string name)
        {
            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, true, false) { name = name, wrapMode = TextureWrapMode.Repeat, anisoLevel = 8 };
            var px = new Color32[Size * Size];
            for (int i = 0; i < px.Length; i++)
            {
                byte g = (byte)Mathf.Clamp(Mathf.RoundToInt((0.5f + shade[i]) * 255f), 0, 255);
                px[i] = new Color32(g, g, g, 255);
            }
            tex.SetPixels32(px);
            tex.Apply(true, true);
            return tex;
        }

        /// <summary>높이 맵을 중앙 차분으로 탄젠트 공간 노멀 맵(RGB, 선형) 으로 바꾼다. 타일 경계도 감싼다.</summary>
        static Texture2D NormalMap(float[] height, float strength, string name)
        {
            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, true, true) { name = name, wrapMode = TextureWrapMode.Repeat, anisoLevel = 8 };
            var px = new Color32[Size * Size];
            float scale = strength * Size / 64f;
            for (int y = 0; y < Size; y++)
            {
                int yn = (y + Size - 1) % Size, yp = (y + 1) % Size;
                for (int x = 0; x < Size; x++)
                {
                    int xn = (x + Size - 1) % Size, xp = (x + 1) % Size;
                    float dx = (height[y * Size + xp] - height[y * Size + xn]) * scale;
                    float dy = (height[yp * Size + x] - height[yn * Size + x]) * scale;
                    var n = new Vector3(-dx, -dy, 1f).normalized;
                    px[y * Size + x] = new Color32(
                        (byte)Mathf.RoundToInt((n.x * .5f + .5f) * 255f),
                        (byte)Mathf.RoundToInt((n.y * .5f + .5f) * 255f),
                        (byte)Mathf.RoundToInt((n.z * .5f + .5f) * 255f), 255);
                }
            }
            tex.SetPixels32(px);
            tex.Apply(true, true);
            return tex;
        }
    }
}
