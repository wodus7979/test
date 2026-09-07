using UnityEngine;

namespace SniperRidge
{
    /// <summary>카메라 후처리: 블룸, ACES 톤매핑, 노출, 채도, 대비, 비네트.</summary>
    [RequireComponent(typeof(Camera))]
    public class PostEffect : MonoBehaviour
    {
        public float Exposure = 1.0f;
        public float BloomThreshold = 1.0f;
        public float BloomIntensity = 0.35f;
        public float Saturation = 1.08f;
        public float Contrast = 1.06f;
        public float Vignette = 0.28f;

        Material mat;

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
        }

        void OnRenderImage(RenderTexture src, RenderTexture dst)
        {
            if (mat == null) { Graphics.Blit(src, dst); return; }

            int w = Mathf.Max(1, src.width / 4), h = Mathf.Max(1, src.height / 4);
            var a = RenderTexture.GetTemporary(w, h, 0, src.format);
            var b = RenderTexture.GetTemporary(w, h, 0, src.format);

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
            mat.SetFloat("_Exposure", Exposure);
            mat.SetFloat("_BloomIntensity", BloomIntensity);
            mat.SetFloat("_Saturation", Saturation);
            mat.SetFloat("_Contrast", Contrast);
            mat.SetFloat("_Vignette", Vignette);
            Graphics.Blit(src, dst, mat, 2);

            RenderTexture.ReleaseTemporary(a);
            RenderTexture.ReleaseTemporary(b);
        }
    }
}
