using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>
    /// 전투 시각 효과: 폭발, 총구 화염, 탄착, 예광탄 스타일, 카메라 흔들림.
    /// 텍스처와 재질은 코드로 한 번만 만들고, 자주 쓰는 효과(총구 화염, 탄착)는 파티클 시스템 하나를 공유해
    /// Emit 으로만 뿌린다. 폭발은 한 번에 여러 겹(섬광·화염구·연기 기둥·지면 먼지 링·불티·파편)을 만든다.
    /// </summary>
    public static class CombatVfx
    {
        // ---------- 텍스처 ----------

        static Texture2D softTex, fireTex, flashTex, debrisTex, tracerTex;

        static Texture2D Make(string name, int w, int h, System.Func<float, float, Color> f)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, true) { name = name, wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    px[y * w + x] = f((x + .5f) / w, (y + .5f) / h);
            tex.SetPixels(px);
            tex.Apply(true, true);
            return tex;
        }

        static float Radial(float u, float v) => Mathf.Clamp01(new Vector2(u * 2f - 1f, v * 2f - 1f).magnitude);

        /// <summary>부드러운 원. 연기, 먼지, 불티.</summary>
        public static Texture2D SoftTexture
        {
            get
            {
                if (softTex == null)
                    softTex = Make("Soft particle", 64, 64, (u, v) =>
                    {
                        float r = Radial(u, v);
                        float a = Mathf.Pow(Mathf.Clamp01(1f - r * r), 2f);
                        return new Color(1f, 1f, 1f, a);
                    });
                return softTex;
            }
        }

        /// <summary>가장자리가 울퉁불퉁한 화염 덩어리. 중심은 흰색에 가깝고 바깥은 주황.</summary>
        public static Texture2D FireTexture
        {
            get
            {
                if (fireTex == null)
                    fireTex = Make("Fire particle", 128, 128, (u, v) =>
                    {
                        float r = Radial(u, v);
                        float n = Mathf.PerlinNoise(u * 5f + 3.1f, v * 5f + 7.7f) * .6f + Mathf.PerlinNoise(u * 11f + 1.3f, v * 11f + 2.9f) * .4f;
                        float edge = Mathf.Clamp01((1f - r) * 1.6f - (1f - n) * .9f);
                        float a = Mathf.Pow(edge, 1.3f);
                        float core = Mathf.Pow(Mathf.Clamp01(1f - r * 1.6f), 2f);
                        Color c = Color.Lerp(new Color(1f, .42f, .08f), new Color(1f, .95f, .75f), core);
                        return new Color(c.r, c.g, c.b, a);
                    });
                return fireTex;
            }
        }

        /// <summary>총구 섬광: 중심 원 + 여섯 갈래 빛줄기.</summary>
        public static Texture2D FlashTexture
        {
            get
            {
                if (flashTex == null)
                    flashTex = Make("Muzzle flash", 128, 128, (u, v) =>
                    {
                        float dx = u * 2f - 1f, dy = v * 2f - 1f;
                        float r = Mathf.Clamp01(Mathf.Sqrt(dx * dx + dy * dy));
                        float ang = Mathf.Atan2(dy, dx);
                        float spikes = Mathf.Pow(Mathf.Abs(Mathf.Cos(ang * 3f)), 14f) * Mathf.Clamp01(1f - r) * .9f
                                     + Mathf.Pow(Mathf.Abs(Mathf.Sin(ang * 3f + .5f)), 30f) * Mathf.Clamp01(1f - r) * .5f;
                        float core = Mathf.Pow(Mathf.Clamp01(1f - r * 2.2f), 1.5f);
                        float halo = Mathf.Pow(Mathf.Clamp01(1f - r), 4f) * .5f;
                        float a = Mathf.Clamp01(core + spikes + halo);
                        Color c = Color.Lerp(new Color(1f, .62f, .2f), new Color(1f, .97f, .85f), Mathf.Clamp01(core * 1.5f));
                        return new Color(c.r, c.g, c.b, a);
                    });
                return flashTex;
            }
        }

        /// <summary>어둡고 불규칙한 파편 조각.</summary>
        public static Texture2D DebrisTexture
        {
            get
            {
                if (debrisTex == null)
                    debrisTex = Make("Debris particle", 32, 32, (u, v) =>
                    {
                        float r = Radial(u, v);
                        float n = Mathf.PerlinNoise(u * 7f + 9.2f, v * 7f + 4.4f);
                        float a = (1f - r) * 1.5f - (1f - n) * .8f > .35f ? 1f : 0f;
                        return new Color(1f, 1f, 1f, a);
                    });
                return debrisTex;
            }
        }

        /// <summary>예광탄 줄: 꼬리(u=0)는 투명, 머리(u=1)는 밝고, 위아래는 부드럽다.</summary>
        public static Texture2D TracerTexture
        {
            get
            {
                if (tracerTex == null)
                    tracerTex = Make("Tracer", 64, 16, (u, v) =>
                    {
                        float along = Mathf.Pow(u, 1.6f);
                        float across = Mathf.Pow(Mathf.Clamp01(1f - Mathf.Abs(v * 2f - 1f)), 1.4f);
                        float head = Mathf.Pow(Mathf.Clamp01((u - .82f) / .18f), 2f) * .6f;
                        return new Color(1f, 1f, 1f, Mathf.Clamp01(along * across + head * across));
                    });
                return tracerTex;
            }
        }

        // ---------- 재질 ----------

        static Material smokeMat, fireMat, flashMat, sparkMat, debrisMat, tracerMat;

        static Shader ParticleShader
        {
            get
            {
                var s = Shader.Find("SniperRidge/CombatParticles");
                if (s == null) s = Resources.Load<Shader>("Shaders/CombatParticles");
                if (s == null) s = Shader.Find("SniperRidge/RocketParticles");
                return s;
            }
        }

        static Material Mat(string name, Texture2D tex, bool additive, float topLight, float invFade, int queueOffset)
        {
            var m = new Material(ParticleShader) { name = name, mainTexture = tex };
            if (m.HasProperty("_SrcBlend"))
            {
                m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                m.SetFloat("_DstBlend", (float)(additive ? BlendMode.One : BlendMode.OneMinusSrcAlpha));
            }
            if (m.HasProperty("_TopLight")) m.SetFloat("_TopLight", topLight);
            if (m.HasProperty("_InvFade")) m.SetFloat("_InvFade", invFade);
            if (m.HasProperty("_FogAdditive")) m.SetFloat("_FogAdditive", additive ? 1f : 0f);
            m.renderQueue = 3000 + queueOffset;
            return m;
        }

        /// <summary>햇빛을 받은 것처럼 위쪽이 밝은 연기 (알파 블렌드, 소프트 파티클).</summary>
        public static Material SmokeMaterial => smokeMat != null ? smokeMat : (smokeMat = Mat("VFX smoke", SoftTexture, false, .8f, .7f, 0));
        /// <summary>화염구, 화재 (가산 블렌드).</summary>
        public static Material FireMaterial => fireMat != null ? fireMat : (fireMat = Mat("VFX fire", FireTexture, true, 0f, 1.5f, 2));
        /// <summary>총구 섬광, 폭발 섬광 (가산 블렌드).</summary>
        public static Material FlashMaterial => flashMat != null ? flashMat : (flashMat = Mat("VFX flash", FlashTexture, true, 0f, 3f, 3));
        /// <summary>불티 (가산 블렌드, 속도 방향으로 늘어남).</summary>
        public static Material SparkMaterial => sparkMat != null ? sparkMat : (sparkMat = Mat("VFX spark", SoftTexture, true, 0f, 3f, 2));
        /// <summary>파편, 흙 조각 (알파 블렌드).</summary>
        public static Material DebrisMaterial => debrisMat != null ? debrisMat : (debrisMat = Mat("VFX debris", DebrisTexture, false, .3f, 3f, 1));
        /// <summary>예광탄 라인 (가산 블렌드).</summary>
        public static Material TracerMaterial => tracerMat != null ? tracerMat : (tracerMat = Mat("VFX tracer", TracerTexture, true, 0f, 3f, 3));

        // ---------- 파티클 시스템 공통 ----------

        static ParticleSystem NewSystem(string name, Material material, int maxParticles, Transform parent = null)
        {
            var go = new GameObject(name);
            if (parent != null) go.transform.SetParent(parent, false);
            go.transform.position = Vector3.zero;
            go.transform.rotation = Quaternion.identity;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.playOnAwake = false; main.loop = false; main.duration = 1f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = maxParticles;
            main.startLifetime = 1f; main.startSpeed = 0f; main.startSize = 1f;
            var emission = ps.emission; emission.enabled = false;
            var shape = ps.shape; shape.enabled = false;
            var renderer = ps.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.alignment = ParticleSystemRenderSpace.View;
            renderer.sortMode = ParticleSystemSortMode.Distance;
            ps.Play();
            return ps;
        }

        static void SizeCurve(ParticleSystem ps, float from, float to)
        {
            var size = ps.sizeOverLifetime; size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.EaseInOut(0f, from, 1f, to));
        }

        static void ColorCurve(ParticleSystem ps, GradientColorKey[] colors, GradientAlphaKey[] alphas)
        {
            var col = ps.colorOverLifetime; col.enabled = true;
            var g = new Gradient(); g.SetKeys(colors, alphas);
            col.color = g;
        }

        static void Dampen(ParticleSystem ps, float amount)
        {
            var limit = ps.limitVelocityOverLifetime; limit.enabled = true;
            limit.dampen = amount; limit.limit = 100f;
        }

        static void Spin(ParticleSystem ps, float radiansPerSecond)
        {
            var rot = ps.rotationOverLifetime; rot.enabled = true;
            rot.z = new ParticleSystem.MinMaxCurve(-radiansPerSecond, radiansPerSecond);
        }

        static void Stretch(ParticleSystem ps, float lengthScale, float velocityScale)
        {
            var renderer = ps.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = ParticleSystemRenderMode.Stretch;
            renderer.lengthScale = lengthScale; renderer.velocityScale = velocityScale;
        }

        static void Emit(ParticleSystem ps, Vector3 position, Vector3 velocity, float size, float life, Color color, float rotationDeg = float.NaN)
        {
            var p = new ParticleSystem.EmitParams
            {
                position = position, velocity = velocity, startSize = size, startLifetime = life, startColor = color,
                rotation = float.IsNaN(rotationDeg) ? Random.Range(0f, 360f) : rotationDeg,
            };
            ps.Emit(p, 1);
        }

        static readonly GradientAlphaKey[] FadeOut = { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, .6f), new GradientAlphaKey(0f, 1f) };
        static readonly GradientColorKey[] White = { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) };

        /// <summary>현재 조명에 맞춘 연기 밝기. 낮에는 밝은 회색, 저녁 도시에서는 푸르스름한 어두운 회색.</summary>
        public static Color SmokeTint()
        {
            var sun = RenderSettings.sun;
            Color light = sun != null && sun.enabled ? sun.color * sun.intensity * .55f : new Color(.5f, .5f, .5f);
            Color ambient = RenderSettings.ambientMode == AmbientMode.Trilight
                ? RenderSettings.ambientSkyColor * RenderSettings.ambientIntensity
                : new Color(.55f, .6f, .7f) * RenderSettings.ambientIntensity;
            Color t = light + ambient * .7f;
            float m = Mathf.Max(t.r, Mathf.Max(t.g, t.b));
            if (m > 1.2f) t /= m / 1.2f;
            t.a = 1f;
            return t;
        }

        static Color Tinted(Color baseColor, Color tint, float alpha) => new Color(baseColor.r * tint.r, baseColor.g * tint.g, baseColor.b * tint.b, alpha);

        // ---------- 폭발 ----------

        /// <summary>
        /// 여러 겹의 폭발. scale 1 = 로켓/수류탄, 1.6 = 전차 포탄 직격, 2.5 = 전차 격파.
        /// 지면이 가까우면 먼지 링을 지면에 깔고, 카메라 거리에 따라 화면을 흔든다.
        /// </summary>
        public static void Explosion(Vector3 point, float scale = 1f)
        {
            var root = new GameObject("Explosion");
            root.transform.position = point;
            Color tint = SmokeTint();

            bool grounded = Physics.Raycast(point + Vector3.up * .6f, Vector3.down, out RaycastHit ground, 4f * scale, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore);
            Vector3 groundPoint = grounded ? ground.point : point;
            Vector3 groundNormal = grounded ? ground.normal : Vector3.up;

            // 섬광: 아주 짧고 크다.
            var flash = NewSystem("Flash", FlashMaterial, 8, root.transform);
            SizeCurve(flash, 1f, 1.7f);
            ColorCurve(flash, White, new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(.5f, .5f), new GradientAlphaKey(0f, 1f) });
            Emit(flash, point, Vector3.zero, 7f * scale, .11f, new Color(1f, .9f, .7f, 1f));
            Emit(flash, point + Vector3.up * .5f * scale, Vector3.zero, 4f * scale, .16f, new Color(1f, .7f, .4f, 1f));

            // 화염구: 안쪽은 흰색, 바깥은 주황에서 검붉게.
            var fire = NewSystem("Fireball", FireMaterial, 32, root.transform);
            SizeCurve(fire, .55f, 1.7f);
            ColorCurve(fire,
                new[] { new GradientColorKey(new Color(1f, .95f, .8f), 0f), new GradientColorKey(new Color(1f, .5f, .12f), .35f), new GradientColorKey(new Color(.45f, .06f, .0f), 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(.9f, .45f), new GradientAlphaKey(0f, 1f) });
            for (int i = 0; i < 14; i++)
            {
                Vector3 dir = (Random.onUnitSphere + Vector3.up * .6f).normalized;
                Emit(fire, point + Random.insideUnitSphere * .5f * scale, dir * Random.Range(1.5f, 4.5f) * scale,
                     Random.Range(2.2f, 3.6f) * scale, Random.Range(.32f, .6f), Color.white);
            }

            // 연기 기둥: 처음엔 불빛을 받아 주황, 곧 회색으로.
            var smoke = NewSystem("Smoke", SmokeMaterial, 48, root.transform);
            SizeCurve(smoke, 1f, 2.8f);
            ColorCurve(smoke,
                new[] { new GradientColorKey(new Color(1f, .62f, .38f), 0f), new GradientColorKey(Color.white, .18f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(.9f, .06f), new GradientAlphaKey(.75f, .45f), new GradientAlphaKey(0f, 1f) });
            Dampen(smoke, .14f); Spin(smoke, .35f);
            var smokeMain = smoke.main; smokeMain.gravityModifier = -.03f;
            Color smokeColor = Tinted(new Color(.33f, .31f, .29f), tint, .85f);
            for (int i = 0; i < 26; i++)
            {
                Vector3 dir = (Random.onUnitSphere + Vector3.up * 1.2f).normalized;
                Emit(smoke, point + Random.insideUnitSphere * .7f * scale, dir * Random.Range(1.5f, 4.5f) * scale + Vector3.up * Random.Range(1f, 3f) * scale,
                     Random.Range(2.4f, 4.4f) * scale, Random.Range(2.2f, 4f), smokeColor, Random.Range(-25f, 25f));
            }

            // 지면 먼지 링: 바깥으로 빠르게 퍼지며 느려진다.
            if (grounded)
            {
                var dust = NewSystem("Dust ring", SmokeMaterial, 32, root.transform);
                SizeCurve(dust, 1f, 2.6f);
                ColorCurve(dust, White, new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(.8f, .08f), new GradientAlphaKey(.5f, .5f), new GradientAlphaKey(0f, 1f) });
                Dampen(dust, .4f);
                Color dustColor = Tinted(new Color(.6f, .53f, .42f), tint, .75f);
                Vector3 tangentA = Vector3.Cross(groundNormal, Vector3.forward).normalized;
                if (tangentA.sqrMagnitude < .01f) tangentA = Vector3.Cross(groundNormal, Vector3.right).normalized;
                Vector3 tangentB = Vector3.Cross(groundNormal, tangentA);
                for (int i = 0; i < 20; i++)
                {
                    float a = i / 20f * Mathf.PI * 2f + Random.Range(-.15f, .15f);
                    Vector3 outward = (tangentA * Mathf.Cos(a) + tangentB * Mathf.Sin(a)).normalized;
                    Emit(dust, groundPoint + groundNormal * .25f * scale + outward * .8f * scale,
                         outward * Random.Range(7f, 12f) * scale + groundNormal * Random.Range(.6f, 1.6f) * scale,
                         Random.Range(1.6f, 2.6f) * scale, Random.Range(.9f, 1.6f), dustColor, Random.Range(-20f, 20f));
                }
            }

            // 불티: 빠르게 튀어 나가 중력에 떨어진다.
            var sparks = NewSystem("Sparks", SparkMaterial, 64, root.transform);
            Stretch(sparks, 1f, .03f);
            ColorCurve(sparks, new[] { new GradientColorKey(new Color(1f, .9f, .6f), 0f), new GradientColorKey(new Color(1f, .5f, .15f), 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, .7f), new GradientAlphaKey(0f, 1f) });
            var sparkMain = sparks.main; sparkMain.gravityModifier = 1.1f;
            for (int i = 0; i < 44; i++)
            {
                Vector3 dir = (Random.onUnitSphere + Vector3.up * .9f).normalized;
                Emit(sparks, point + Random.insideUnitSphere * .3f * scale, dir * Random.Range(8f, 26f) * scale,
                     Random.Range(.09f, .18f) * scale, Random.Range(.45f, 1.2f), Color.white);
            }

            // 파편: 어두운 조각이 포물선으로 떨어진다.
            var debris = NewSystem("Debris", DebrisMaterial, 32, root.transform);
            Spin(debris, 6f);
            ColorCurve(debris, White, new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, .85f), new GradientAlphaKey(0f, 1f) });
            var debrisMain = debris.main; debrisMain.gravityModifier = 1.5f;
            Color debrisColor = Tinted(new Color(.14f, .12f, .1f), tint, 1f);
            for (int i = 0; i < 16; i++)
            {
                Vector3 dir = (Random.onUnitSphere + Vector3.up * 1.1f).normalized;
                Emit(debris, point + Random.insideUnitSphere * .4f * scale, dir * Random.Range(5f, 14f) * scale,
                     Random.Range(.16f, .4f) * scale, Random.Range(1f, 2.2f), debrisColor);
            }

            // 조명: 강하게 켜졌다가 빠르게 잦아든다.
            var lightGo = new GameObject("Explosion light");
            lightGo.transform.SetParent(root.transform, false);
            lightGo.transform.position = point + Vector3.up * .8f * scale;
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Point; light.color = new Color(1f, .6f, .25f);
            light.intensity = 10f * Mathf.Sqrt(scale); light.range = 22f * scale; light.shadows = LightShadows.None;
            lightGo.AddComponent<DecayingLight>().Life = .35f;

            CameraShake.Impulse(point, 45f * scale, 1.1f * scale);
            Object.Destroy(root, 5.5f);
        }

        // ---------- 총구 화염 ----------

        static ParticleSystem muzzleFlashPs, muzzleFlamePs, muzzleSmokePs;

        static void EnsureMuzzleSystems()
        {
            if (muzzleFlashPs != null) return;
            var root = new GameObject("Muzzle VFX pool");
            muzzleFlashPs = NewSystem("Muzzle flash", FlashMaterial, 128, root.transform);
            SizeCurve(muzzleFlashPs, 1f, .55f);
            ColorCurve(muzzleFlashPs, White, new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(.8f, .4f), new GradientAlphaKey(0f, 1f) });

            muzzleFlamePs = NewSystem("Muzzle flame", FireMaterial, 128, root.transform);
            Stretch(muzzleFlamePs, 1.6f, .02f);
            SizeCurve(muzzleFlamePs, 1f, .4f);
            ColorCurve(muzzleFlamePs, new[] { new GradientColorKey(new Color(1f, .9f, .6f), 0f), new GradientColorKey(new Color(1f, .5f, .15f), 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0f, 1f) });

            muzzleSmokePs = NewSystem("Muzzle smoke", SmokeMaterial, 256, root.transform);
            SizeCurve(muzzleSmokePs, .6f, 3f);
            ColorCurve(muzzleSmokePs, White, new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(.45f, .1f), new GradientAlphaKey(0f, 1f) });
            Dampen(muzzleSmokePs, .5f);
            var main = muzzleSmokePs.main; main.gravityModifier = -.04f;
        }

        /// <summary>무기 종류에 맞는 총구 화염 크기.</summary>
        public static float MuzzleScale(WeaponDefinition w)
        {
            if (w == null) return 1f;
            if (w.IsRocket) return 1.7f;
            if (w.IsMounted) return 1.5f;
            string id = w.Id ?? "";
            if (id.Contains("pistol")) return .55f;
            if (id.Contains("smg")) return .7f;
            if (id.Contains("shotgun")) return 1.35f;
            if (id.Contains("sniper") || id.Contains("dmr")) return 1.25f;
            if (id.Contains("lmg") || id.Contains("hmg")) return 1.15f;
            return 1f;
        }

        /// <summary>
        /// 총구 화염 한 번. scale 1 = 소총. 섬광 스프라이트 + 앞으로 뻗는 화염 줄기 + 남는 연기.
        /// 적과 아군 모두 같은 함수를 쓴다.
        /// </summary>
        public static void MuzzleFlash(Vector3 muzzle, Vector3 forward, float scale = 1f, bool smoke = true)
        {
            EnsureMuzzleSystems();
            forward = forward.sqrMagnitude > .001f ? forward.normalized : Vector3.forward;
            Vector3 tip = muzzle + forward * .05f * scale;
            Emit(muzzleFlashPs, tip, forward * .5f, Random.Range(.34f, .5f) * scale, .05f, new Color(1f, .88f, .6f, 1f));
            Emit(muzzleFlashPs, tip + forward * .12f * scale, forward * .5f, Random.Range(.18f, .28f) * scale, .04f, new Color(1f, .75f, .4f, .9f));
            for (int i = 0; i < 3; i++)
            {
                Vector3 side = Random.insideUnitSphere * .25f;
                Emit(muzzleFlamePs, tip + forward * Random.Range(.04f, .12f) * scale, (forward + side).normalized * Random.Range(7f, 12f) * scale,
                     Random.Range(.16f, .24f) * scale, Random.Range(.04f, .07f), Color.white);
            }
            if (!smoke) return;
            Color smokeColor = Tinted(new Color(.72f, .7f, .65f), SmokeTint(), .5f);
            for (int i = 0; i < 3; i++)
            {
                Emit(muzzleSmokePs, tip + forward * Random.Range(.1f, .3f) * scale,
                     forward * Random.Range(.8f, 1.8f) * scale + Vector3.up * Random.Range(.3f, .7f) + Random.insideUnitSphere * .3f,
                     Random.Range(.12f, .2f) * scale, Random.Range(.5f, 1.1f), smokeColor, Random.Range(-30f, 30f));
            }
        }

        /// <summary>전차 주포: 큰 화염, 두꺼운 연기, 지면 먼지.</summary>
        public static void CannonBlast(Vector3 muzzle, Vector3 forward)
        {
            MuzzleFlash(muzzle, forward, 4.5f, false);
            EnsureMuzzleSystems();
            forward = forward.normalized;
            Color smokeColor = Tinted(new Color(.6f, .58f, .53f), SmokeTint(), .7f);
            for (int i = 0; i < 14; i++)
            {
                Vector3 spread = Random.insideUnitSphere * 1.2f;
                Emit(muzzleSmokePs, muzzle + forward * Random.Range(.5f, 2.5f) + spread * .3f,
                     (forward * Random.Range(3f, 9f) + spread + Vector3.up * .8f), Random.Range(.9f, 1.6f), Random.Range(1.2f, 2.2f), smokeColor, Random.Range(-40f, 40f));
            }
            if (Physics.Raycast(muzzle, Vector3.down, out RaycastHit ground, 5f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
            {
                Color dustColor = Tinted(new Color(.6f, .53f, .42f), SmokeTint(), .55f);
                for (int i = 0; i < 10; i++)
                {
                    Vector3 side = Vector3.Cross(forward, Vector3.up) * Random.Range(-1f, 1f);
                    Emit(muzzleSmokePs, ground.point + ground.normal * .3f + forward * Random.Range(1f, 4f) + side * 1.5f,
                         forward * Random.Range(2f, 6f) + side * 2f + ground.normal * .6f, Random.Range(1.2f, 2f), Random.Range(1f, 1.8f), dustColor, Random.Range(-20f, 20f));
                }
            }
            CameraShake.Impulse(muzzle, 30f, .5f);
        }

        // ---------- 탄착 ----------

        static ParticleSystem impactDustPs, impactSparkPs, impactChipPs;

        static void EnsureImpactSystems()
        {
            if (impactDustPs != null) return;
            var root = new GameObject("Impact VFX pool");
            impactDustPs = NewSystem("Impact dust", SmokeMaterial, 512, root.transform);
            SizeCurve(impactDustPs, .7f, 2.4f);
            ColorCurve(impactDustPs, White, new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(.85f, .08f), new GradientAlphaKey(.5f, .5f), new GradientAlphaKey(0f, 1f) });
            Dampen(impactDustPs, .45f);
            var dustMain = impactDustPs.main; dustMain.gravityModifier = .05f;

            impactSparkPs = NewSystem("Impact sparks", SparkMaterial, 256, root.transform);
            Stretch(impactSparkPs, 1f, .04f);
            ColorCurve(impactSparkPs, new[] { new GradientColorKey(new Color(1f, .92f, .7f), 0f), new GradientColorKey(new Color(1f, .55f, .2f), 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0f, 1f) });
            var sparkMain = impactSparkPs.main; sparkMain.gravityModifier = 1.2f;

            impactChipPs = NewSystem("Impact chips", DebrisMaterial, 256, root.transform);
            Spin(impactChipPs, 8f);
            ColorCurve(impactChipPs, White, new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, .8f), new GradientAlphaKey(0f, 1f) });
            var chipMain = impactChipPs.main; chipMain.gravityModifier = 1.4f;
        }

        /// <summary>탄착: 먼지 구름 + 불티 + 튀는 조각. size 는 기존 Effects.Dust 와 같은 단위 (소총탄 .25).</summary>
        public static void Impact(Vector3 point, Vector3 normal, float size, Color? dustTint = null)
        {
            EnsureImpactSystems();
            float s = size * 2.6f;
            Color tint = SmokeTint();
            Color dustColor = Tinted(dustTint ?? new Color(.62f, .55f, .42f), tint, .65f);
            for (int i = 0; i < 5; i++)
            {
                Vector3 dir = (normal * Random.Range(1f, 2.4f) + Random.onUnitSphere * .8f).normalized;
                Emit(impactDustPs, point + normal * .04f + Random.insideUnitSphere * .08f * s,
                     dir * Random.Range(1.2f, 2.6f) * s, Random.Range(.5f, .9f) * s, Random.Range(.5f, .95f), dustColor, Random.Range(-30f, 30f));
            }
            for (int i = 0; i < 6; i++)
            {
                Vector3 dir = (normal * Random.Range(1.5f, 4f) + Random.onUnitSphere * 1.8f).normalized;
                Emit(impactSparkPs, point + normal * .03f, dir * Random.Range(4f, 9f) * s, Random.Range(.03f, .06f) * s, Random.Range(.18f, .35f), Color.white);
            }
            Color chipColor = Tinted(dustTint.HasValue ? dustTint.Value * .55f : new Color(.3f, .26f, .2f), tint, 1f);
            for (int i = 0; i < 4; i++)
            {
                Vector3 dir = (normal * 2f + Random.onUnitSphere * 1.5f).normalized;
                Emit(impactChipPs, point + normal * .03f, dir * Random.Range(1.5f, 4f) * s, Random.Range(.04f, .09f) * s, Random.Range(.5f, 1f), chipColor);
            }
        }

        /// <summary>색이 있는 먼지 구름만 (불티·조각 없음). 기존 Effects.Puff 대체.</summary>
        public static void Puff(Vector3 point, Vector3 normal, float size, Color color, float life)
        {
            EnsureImpactSystems();
            Color c = Tinted(color, SmokeTint(), Mathf.Clamp01(color.a > 0f ? color.a : .7f));
            for (int i = 0; i < 5; i++)
            {
                Vector3 dir = (normal + Random.onUnitSphere * .7f).normalized;
                Emit(impactDustPs, point + normal * .1f + Random.insideUnitSphere * size * .4f, dir * Random.Range(.6f, 1.6f) * size * 2f,
                     Random.Range(.8f, 1.4f) * size * 2f, life * Random.Range(.8f, 1.2f), c, Random.Range(-30f, 30f));
            }
        }

        // ---------- 예광탄 ----------

        /// <summary>라인 렌더러를 예광탄 스타일로: 꼬리는 가늘고 투명, 머리는 굵고 밝은 가산 블렌드.</summary>
        public static void StyleTracer(LineRenderer lr, Color color, float headWidth)
        {
            lr.sharedMaterial = TracerMaterial;
            lr.textureMode = LineTextureMode.Stretch;
            lr.alignment = LineAlignment.View;
            lr.numCapVertices = 2;
            lr.widthCurve = AnimationCurve.EaseInOut(0f, headWidth * .3f, 1f, headWidth);
            lr.widthMultiplier = 1f;
            var g = new Gradient();
            Color bright = new Color(Mathf.Min(1f, color.r * 1.2f + .15f), Mathf.Min(1f, color.g * 1.2f + .1f), Mathf.Min(1f, color.b * 1.1f), 1f);
            g.SetKeys(new[] { new GradientColorKey(color, 0f), new GradientColorKey(bright, 1f) },
                      new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(.7f, .5f), new GradientAlphaKey(1f, 1f) });
            lr.colorGradient = g;
            lr.shadowCastingMode = ShadowCastingMode.Off;
            lr.receiveShadows = false;
        }
    }

    /// <summary>강하게 켜졌다가 제곱 곡선으로 잦아드는 광원. 수명이 끝나면 오브젝트를 지운다.</summary>
    public sealed class DecayingLight : MonoBehaviour
    {
        public float Life = .3f;
        float t, start;
        Light lamp;
        void Awake() { lamp = GetComponent<Light>(); }
        void Start() { if (lamp != null) start = lamp.intensity; }
        void Update()
        {
            t += Time.deltaTime;
            if (t >= Life) { Destroy(gameObject); return; }
            float k = 1f - t / Life;
            if (lamp != null) lamp.intensity = start * k * k;
        }
    }

    /// <summary>
    /// 폭발·포격 때 카메라를 흔든다. 렌더 직전에 회전을 더하고 렌더 직후 되돌리므로
    /// 카메라를 조종하는 다른 스크립트와 충돌하지 않는다.
    /// </summary>
    [DefaultExecutionOrder(900)]
    public sealed class CameraShake : MonoBehaviour
    {
        static CameraShake instance;
        float trauma;
        Quaternion saved;
        bool applied;

        void OnEnable() { instance = this; }
        void OnDisable() { if (instance == this) instance = null; }

        /// <summary>point 에서 radius 안에 있을수록 강하게. strength 1 = 가까운 로켓 폭발.</summary>
        public static void Impulse(Vector3 point, float radius, float strength)
        {
            if (instance == null) return;
            float k = Mathf.Clamp01(1f - Vector3.Distance(instance.transform.position, point) / radius);
            instance.trauma = Mathf.Min(1.4f, instance.trauma + strength * k * k);
        }

        void Update() { trauma = Mathf.Max(0f, trauma - Time.deltaTime * 1.7f); }

        void OnPreCull()
        {
            if (trauma <= 0.001f) return;
            float t = Time.time;
            float a = trauma * trauma;
            float pitch = (Mathf.PerlinNoise(t * 23f, .3f) * 2f - 1f) * a * 2.4f;
            float yaw = (Mathf.PerlinNoise(.7f, t * 21f) * 2f - 1f) * a * 2.4f;
            float roll = (Mathf.PerlinNoise(t * 19f, t * 17f) * 2f - 1f) * a * 1.5f;
            saved = transform.localRotation;
            transform.localRotation = saved * Quaternion.Euler(pitch, yaw, roll);
            applied = true;
        }

        void OnPostRender()
        {
            if (!applied) return;
            transform.localRotation = saved;
            applied = false;
        }
    }
}
