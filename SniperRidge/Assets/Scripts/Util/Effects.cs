using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>예광탄, 먼지, 섬광 등 간단한 시각 효과.</summary>
    public static class Effects
    {
        static readonly Dictionary<Color, Material> unlitCache = new Dictionary<Color, Material>();

        public static Material Unlit(Color color)
        {
            if (!unlitCache.TryGetValue(color, out Material m))
            {
                m = ProceduralAssets.UnlitMaterial(color);
                unlitCache[color] = m;
            }
            return m;
        }

        public static void Tracer(Vector3 from, Vector3 to, Color color, float life, float width)
        {
            var go = new GameObject("Tracer");
            var lr = go.AddComponent<LineRenderer>();
            lr.useWorldSpace = true;
            lr.positionCount = 2;
            lr.SetPosition(0, from);
            lr.SetPosition(1, to);
            lr.startWidth = width;
            lr.endWidth = width;
            lr.material = Unlit(color);
            lr.shadowCastingMode = ShadowCastingMode.Off;
            lr.receiveShadows = false;
            Object.Destroy(go, life);
        }

        public static void Dust(Vector3 pos, Vector3 normal, float size)
        {
            Puff(pos, normal, size, new Color(0.62f, 0.55f, 0.42f), 0.7f);
        }

        public static void Puff(Vector3 pos, Vector3 normal, float size, Color color, float life)
        {
            var mat = Unlit(color);
            for (int i = 0; i < 3; i++)
            {
                var s = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                s.name = "Dust";
                Object.Destroy(s.GetComponent<Collider>());
                s.transform.position = pos + normal * 0.15f + Random.insideUnitSphere * size * 0.6f;
                s.transform.localScale = Vector3.one * size * Random.Range(0.6f, 1.1f);
                var r = s.GetComponent<Renderer>();
                r.material = mat;
                r.shadowCastingMode = ShadowCastingMode.Off;
                s.AddComponent<DustPuff>().Life = life;
            }
        }

        public static void Flash(Vector3 pos, Color color, float intensity, float range, float life)
        {
            var go = new GameObject("Flash");
            go.transform.position = pos;
            var l = go.AddComponent<Light>();
            l.type = LightType.Point;
            l.color = color;
            l.intensity = intensity;
            l.range = range;
            l.shadows = LightShadows.None;
            Object.Destroy(go, life);
        }
    }

    public class DustPuff : MonoBehaviour
    {
        public float Life = 0.7f;
        float t;
        Vector3 startScale;

        void Start() { startScale = transform.localScale; }

        void Update()
        {
            t += Time.deltaTime;
            float k = t / Life;
            transform.localScale = startScale * (1f + k * 2.5f);
            transform.position += Vector3.up * Time.deltaTime * 1.2f;
            if (t >= Life) Destroy(gameObject);
        }
    }
}
