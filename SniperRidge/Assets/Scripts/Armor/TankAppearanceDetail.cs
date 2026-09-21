using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    // Per-vehicle materials share across LODs; no source asset is changed at runtime.
    public sealed class TankAppearanceDetail : MonoBehaviour
    {
        readonly Dictionary<Material, Material> finishes = new Dictionary<Material, Material>();
        bool weatherShader;

        public void Initialize(Color paint)
        {
            var shader = Resources.Load<Shader>("Shaders/TankSurface");
            weatherShader = GraphicsSettings.currentRenderPipeline == null && shader != null && shader.isSupported;
            foreach (var renderer in GetComponentsInChildren<MeshRenderer>(true))
            {
                var slots = renderer.sharedMaterials;
                for (int i = 0; i < slots.Length; i++)
                {
                    var source = slots[i];
                    if (source == null) continue;
                    if (!finishes.TryGetValue(source, out var material))
                    {
                        string name = source.name.ToLowerInvariant();
                        bool armor = name.Contains("camo") || name.Contains("armor");
                        bool rubber = name.Contains("rubber");
                        bool glass = name.Contains("optic") || name.Contains("glass");
                        bool recess = name.Contains("recess") || name.Contains("darksteel");
                        bool dust = name.Contains("dust");
                        material = weatherShader ? new Material(shader) : new Material(source);
                        material.name = source.name + " field finish";
                        material.enableInstancing = true;
                        if (weatherShader)
                        {
                            material.SetTexture("_MainTex", source.mainTexture != null ? source.mainTexture : Texture2D.whiteTexture);
                            material.mainTextureScale = source.mainTextureScale;
                            if (source.HasProperty("_BumpMap") && source.GetTexture("_BumpMap") != null)
                            {
                                material.SetTexture("_BumpMap", source.GetTexture("_BumpMap"));
                                material.SetTextureScale("_BumpMap", source.GetTextureScale("_BumpMap"));
                            }
                        }
                        Color tint = armor ? paint : glass ? new Color(.12f,.22f,.26f) :
                            rubber ? new Color(.24f,.26f,.25f) : recess ? new Color(.095f,.105f,.10f) :
                            dust ? new Color(.27f,.22f,.16f) : new Color(.46f,.48f,.45f);
                        float metallic = armor ? .08f : rubber || dust ? 0 : glass ? .35f : .72f;
                        float gloss = armor ? .32f : rubber || dust ? .13f : glass ? .88f : .4f;
                        SetColor(material, "_Color", tint); SetColor(material, "_BaseColor", tint);
                        SetFloat(material, "_Metallic", metallic);
                        SetFloat(material, "_Glossiness", gloss); SetFloat(material, "_Smoothness", gloss);
                        if (weatherShader)
                        {
                            material.SetFloat("_Paint", armor ? 1 : 0);
                            material.SetFloat("_Weather", glass ? .015f : rubber || dust ? .7f : .43f);
                        }
                        finishes.Add(source, material);
                    }
                    slots[i] = material;
                    renderer.SetPropertyBlock(null, i);
                }
                renderer.sharedMaterials = slots;
            }
            if (GetComponent<TankTrackDetail>() == null && transform.Find("TrackLeft") == null)
            {
                // The imported K2 joins running gear into its hull mesh.
                foreach (var pair in finishes)
                    if (pair.Key.name == "K2_BareMetal")
                    { gameObject.AddComponent<TankTrackDetail>().Initialize(pair.Value); break; }
            }
            LateUpdate();
        }

        public void Burn()
        {
            foreach (var material in finishes.Values)
            {
                if (weatherShader) material.SetFloat("_Destroyed", 1);
                else { SetColor(material, "_Color", new Color(.045f,.04f,.035f)); SetColor(material, "_BaseColor", new Color(.045f,.04f,.035f)); }
            }
        }
        void LateUpdate()
        {
            if (!weatherShader) return;
            var matrix = transform.worldToLocalMatrix;
            foreach (var material in finishes.Values) material.SetMatrix("_TankWorldToLocal", matrix);
        }
        void OnDestroy()
        {
            foreach (var material in finishes.Values)
                if (material != null) { if (Application.isPlaying) Destroy(material); else DestroyImmediate(material); }
        }
        static void SetFloat(Material m, string key, float value) { if (m.HasProperty(key)) m.SetFloat(key,value); }
        static void SetColor(Material m, string key, Color value) { if (m.HasProperty(key)) m.SetColor(key,value); }
    }
}
