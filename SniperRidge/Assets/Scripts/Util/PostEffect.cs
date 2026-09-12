using UnityEngine;

namespace SniperRidge
{
    /// <summary>화면 톤 프리셋. 사실적인 밀리터리 색감을 상황별로 묶어 둔다.</summary>
    public enum PostPreset
    {
        /// <summary>낮의 들판/참호: 살짝 따뜻한 햇빛, 차가운 그림자, 낮은 채도.</summary>
        DaylightField,
        /// <summary>푸른 저녁의 군사 도시: 차가운 전체 톤, 투광등 하이라이트는 따뜻하게.</summary>
        EveningTown,
    }

    /// <summary>
    /// 카메라 후처리: SSAO, 블룸, 노출, 화이트 밸런스, ACES 톤매핑, 리프트/감마/게인,
    /// 스플릿 토닝, 채도, 대비, 비네트, 필름 그레인, 샤프닝.
    /// 모바일에서는 SSAO/샤프닝/그레인을 끈다.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public class PostEffect : MonoBehaviour
    {
        [Header("노출 / 블룸")]
        public float Exposure = 1.0f;
        public float BloomThreshold = 1.0f;
        public float BloomIntensity = 0.35f;

        [Header("색")]
        public float Saturation = 1.0f;
        public float Contrast = 1.03f;
        public float Vignette = 0.14f;
        [Tooltip("-1 차갑게 … +1 따뜻하게")] public float Temperature = 0f;
        [Tooltip("-1 녹색 … +1 자홍")] public float Tint = 0f;
        public Color Lift = new Color(0f, 0f, 0f, 0f);
        public Color Gamma = new Color(1f, 1f, 1f, 1f);
        public Color Gain = new Color(1f, 1f, 1f, 1f);
        [Tooltip("어두운 영역에 곱해질 색 (0.5 회색이 중립)")] public Color SplitShadows = new Color(.5f, .5f, .5f, 1f);
        [Tooltip("밝은 영역에 곱해질 색 (0.5 회색이 중립)")] public Color SplitHighlights = new Color(.5f, .5f, .5f, 1f);
        public float SplitStrength = 0f;
        public float SplitBalance = 0f;

        [Header("SSAO")]
        public float AoIntensity = 0f;
        public float AoRadius = 0.8f;
        public float AoBias = 0.06f;
        public float AoPower = 1.6f;
        public float AoMaxDistance = 70f;

        [Header("마무리")]
        public float Sharpen = 0f;
        public float Grain = 0f;

        Material mat;
        Camera cam;

        void OnEnable()
        {
            var shader = Shader.Find("Hidden/SniperRidge/Post");
            if (shader == null || !shader.isSupported)
            {
                Debug.LogWarning("[Sniper Ridge] 후처리 셰이더를 찾지 못해 후처리를 끕니다.");
                enabled = false;
                return;
            }
            mat = new Material(shader);
            cam = GetComponent<Camera>();
            UpdateDepthMode();
        }

        void OnDisable()
        {
            if (mat != null) Destroy(mat);
            mat = null;
        }

        bool AoEnabled => AoIntensity > 0.001f && !Application.isMobilePlatform;

        void UpdateDepthMode()
        {
            if (cam == null) return;
            if (AoEnabled) cam.depthTextureMode |= DepthTextureMode.DepthNormals;
            else cam.depthTextureMode &= ~DepthTextureMode.DepthNormals;
        }

        /// <summary>프리셋을 적용한다. 이후 개별 값을 덮어써도 된다.</summary>
        public void ApplyPreset(PostPreset preset)
        {
            bool mobile = Application.isMobilePlatform;
            switch (preset)
            {
                case PostPreset.DaylightField:
                    Exposure = 1.0f; BloomThreshold = 1.1f; BloomIntensity = mobile ? .2f : .12f;
                    Saturation = .86f; Contrast = 1.08f; Vignette = .18f;
                    Temperature = .08f; Tint = 0f;
                    Lift = new Color(0f, 0f, .012f, 0f);
                    Gamma = new Color(1f, 1f, 1f, 1f);
                    Gain = new Color(1.03f, 1.0f, .96f, 1f);
                    SplitShadows = new Color(.46f, .49f, .55f, 1f);
                    SplitHighlights = new Color(.55f, .52f, .46f, 1f);
                    SplitStrength = .32f; SplitBalance = -.05f;
                    AoIntensity = .8f; AoRadius = .8f; AoBias = .06f; AoPower = 1.6f; AoMaxDistance = 70f;
                    Sharpen = .35f; Grain = .03f;
                    break;
                case PostPreset.EveningTown:
                    Exposure = 1.08f; BloomThreshold = 1.0f; BloomIntensity = .15f;
                    Saturation = .74f; Contrast = 1.06f; Vignette = .14f;
                    Temperature = -.06f; Tint = 0f;
                    Lift = new Color(0f, .004f, .02f, 0f);
                    Gamma = new Color(1f, 1f, .98f, 1f);
                    Gain = new Color(1.0f, 1.0f, 1.02f, 1f);
                    SplitShadows = new Color(.44f, .48f, .58f, 1f);
                    SplitHighlights = new Color(.57f, .52f, .44f, 1f);
                    SplitStrength = .4f; SplitBalance = -.08f;
                    AoIntensity = .85f; AoRadius = .7f; AoBias = .06f; AoPower = 1.7f; AoMaxDistance = 60f;
                    Sharpen = .3f; Grain = .045f;
                    break;
            }
            if (mobile) { Sharpen = 0f; Grain = 0f; AoIntensity = 0f; }
            UpdateDepthMode();
        }

        static Vector4 WhiteBalance(float temperature, float tint)
        {
            // 간단한 근사: 온도는 R/B 를 반대로, 틴트는 G 를 조정한다. 밝기 합은 유지.
            float t = Mathf.Clamp(temperature, -1f, 1f) * .12f;
            float g = Mathf.Clamp(tint, -1f, 1f) * .08f;
            var wb = new Vector3(1f + t, 1f + g, 1f - t);
            float lum = wb.x * .2126f + wb.y * .7152f + wb.z * .0722f;
            wb /= Mathf.Max(lum, 1e-3f);
            return new Vector4(wb.x, wb.y, wb.z, 1f);
        }

        void OnRenderImage(RenderTexture src, RenderTexture dst)
        {
            if (mat == null) { Graphics.Blit(src, dst); return; }
            if (cam == null) cam = GetComponent<Camera>();
            bool ao = AoEnabled;
            if (ao && (cam.depthTextureMode & DepthTextureMode.DepthNormals) == 0) UpdateDepthMode();

            // ---- 블룸 (1/4 해상도) ----
            int w = Mathf.Max(1, src.width / 4), h = Mathf.Max(1, src.height / 4);
            var a = RenderTexture.GetTemporary(w, h, 0, src.format);
            var b = RenderTexture.GetTemporary(w, h, 0, src.format);
            a.filterMode = b.filterMode = FilterMode.Bilinear;
            a.wrapMode = b.wrapMode = TextureWrapMode.Clamp;
            mat.SetFloat("_Threshold", BloomThreshold);
            Graphics.Blit(src, a, mat, 0);
            mat.SetVector("_BlurDir", new Vector4(1f / w, 0f, 0f, 0f));
            Graphics.Blit(a, b, mat, 1);
            mat.SetVector("_BlurDir", new Vector4(0f, 1f / h, 0f, 0f));
            Graphics.Blit(b, a, mat, 1);
            mat.SetVector("_BlurDir", new Vector4(2f / w, 0f, 0f, 0f));
            Graphics.Blit(a, b, mat, 1);
            mat.SetVector("_BlurDir", new Vector4(0f, 2f / h, 0f, 0f));
            Graphics.Blit(b, a, mat, 1);
            mat.SetTexture("_Bloom", a);

            // ---- SSAO (1/2 해상도, 깊이 인식 블러) ----
            RenderTexture aoA = null, aoB = null;
            if (ao)
            {
                int aw = Mathf.Max(1, src.width / 2), ah = Mathf.Max(1, src.height / 2);
                var aoFormat = SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.R8) ? RenderTextureFormat.R8 : RenderTextureFormat.Default;
                aoA = RenderTexture.GetTemporary(aw, ah, 0, aoFormat);
                aoB = RenderTexture.GetTemporary(aw, ah, 0, aoFormat);
                aoA.filterMode = aoB.filterMode = FilterMode.Bilinear;
                aoA.wrapMode = aoB.wrapMode = TextureWrapMode.Clamp;
                float tanY = Mathf.Tan(cam.fieldOfView * .5f * Mathf.Deg2Rad);
                mat.SetVector("_AoProj", new Vector4(tanY * cam.aspect, tanY, 0f, 0f));
                mat.SetVector("_AoParams", new Vector4(AoRadius, AoBias, AoPower, AoMaxDistance));
                Graphics.Blit(src, aoA, mat, 2);
                mat.SetVector("_BlurDir", new Vector4(1f / aw, 0f, 0f, 0f));
                Graphics.Blit(aoA, aoB, mat, 3);
                mat.SetVector("_BlurDir", new Vector4(0f, 1f / ah, 0f, 0f));
                Graphics.Blit(aoB, aoA, mat, 3);
                mat.SetTexture("_AO", aoA);
                mat.SetFloat("_AoIntensity", AoIntensity);
            }
            else
            {
                mat.SetTexture("_AO", Texture2D.whiteTexture);
                mat.SetFloat("_AoIntensity", 0f);
            }

            // ---- 합성 + 색보정 ----
            mat.SetFloat("_Exposure", Exposure);
            mat.SetFloat("_BloomIntensity", BloomIntensity);
            mat.SetFloat("_Saturation", Saturation);
            mat.SetFloat("_Contrast", Contrast);
            mat.SetFloat("_Vignette", Vignette);
            mat.SetVector("_WhiteBalance", WhiteBalance(Temperature, Tint));
            mat.SetVector("_Lift", new Vector4(Lift.r, Lift.g, Lift.b, 0f));
            mat.SetVector("_Gamma", new Vector4(1f / Mathf.Max(Gamma.r, .05f), 1f / Mathf.Max(Gamma.g, .05f), 1f / Mathf.Max(Gamma.b, .05f), 1f));
            mat.SetVector("_Gain", new Vector4(Gain.r, Gain.g, Gain.b, 1f));
            mat.SetVector("_SplitShadows", new Vector4(SplitShadows.r, SplitShadows.g, SplitShadows.b, 1f));
            mat.SetVector("_SplitHighlights", new Vector4(SplitHighlights.r, SplitHighlights.g, SplitHighlights.b, 1f));
            mat.SetFloat("_SplitStrength", SplitStrength);
            mat.SetFloat("_SplitBalance", SplitBalance);
            mat.SetFloat("_Grain", Application.isMobilePlatform ? 0f : Grain);

            bool sharpen = Sharpen > 0.001f && !Application.isMobilePlatform;
            if (sharpen)
            {
                var ldr = RenderTexture.GetTemporary(src.width, src.height, 0, RenderTextureFormat.Default);
                ldr.filterMode = FilterMode.Bilinear;
                Graphics.Blit(src, ldr, mat, 4);
                mat.SetFloat("_Sharpen", Sharpen);
                Graphics.Blit(ldr, dst, mat, 5);
                RenderTexture.ReleaseTemporary(ldr);
            }
            else
            {
                Graphics.Blit(src, dst, mat, 4);
            }

            RenderTexture.ReleaseTemporary(a);
            RenderTexture.ReleaseTemporary(b);
            if (aoA != null) RenderTexture.ReleaseTemporary(aoA);
            if (aoB != null) RenderTexture.ReleaseTemporary(aoB);
        }
    }
}
