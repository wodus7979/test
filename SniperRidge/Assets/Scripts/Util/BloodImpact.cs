using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>Bounded world-space mist/droplets with short-lived surface spatter.</summary>
    public sealed class BloodImpact : MonoBehaviour
    {
        const int MaxMarks = 48;
        static BloodImpact instance;
        ParticleSystem drops, mist;
        Material material;
        Texture2D texture;
        readonly List<ParticleCollisionEvent> collisions = new List<ParticleCollisionEvent>(32);
        readonly Renderer[] marks = new Renderer[MaxMarks];
        readonly float[] markTimes = new float[MaxMarks];
        readonly MaterialPropertyBlock properties = new MaterialPropertyBlock();
        int nextMark;
        float nextMarkTime;
        public static void Emit(Vector3 point, Vector3 surfaceNormal, Vector3 incoming, bool headshot)
        {
            if (instance == null) instance = new GameObject("Blood impact effects").AddComponent<BloodImpact>();
            instance.Burst(point, surfaceNormal, incoming, headshot);
        }
        void Awake()
        {
            instance = this;
            texture = Pattern();
            material = new Material(Resources.Load<Shader>("Shaders/BloodParticles")) { mainTexture = texture };
            drops = MakeSystem("Impact droplets", 384, true);
            mist = MakeSystem("Fine blood mist", 96, false);
        }
        ParticleSystem MakeSystem(string name, int capacity, bool ballistic)
        {
            var go = new GameObject(name); go.transform.SetParent(transform, false);
            // Collision messages are delivered to the object carrying the ParticleSystem.
            if (ballistic) go.AddComponent<BloodCollisionRelay>();
            var system = go.AddComponent<ParticleSystem>(); system.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = system.main;
            main.playOnAwake = false; main.loop = true; main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = capacity; main.gravityModifier = ballistic ? .85f : .1f;
            var emission = system.emission; emission.enabled = false;
            var shape = system.shape; shape.enabled = false;
            var color = system.colorOverLifetime; color.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(new Color(.55f,.5f,.5f),1) },
                new[] { new GradientAlphaKey(1,0), new GradientAlphaKey(.7f,.35f), new GradientAlphaKey(0,1) });
            color.color = gradient;
            var size = system.sizeOverLifetime; size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, ballistic ? 1 : .55f, 1, ballistic ? .6f : 1.8f));
            var renderer = system.GetComponent<ParticleSystemRenderer>(); renderer.sharedMaterial = material;
            renderer.renderMode = ballistic ? ParticleSystemRenderMode.Stretch : ParticleSystemRenderMode.Billboard;
            renderer.velocityScale = ballistic ? .025f : 0; renderer.lengthScale = ballistic ? 1.6f : 1;
            renderer.shadowCastingMode = ShadowCastingMode.Off; renderer.receiveShadows = false;
            if (ballistic)
            {
                var collision = system.collision; collision.enabled = true;
                collision.type = ParticleSystemCollisionType.World; collision.mode = ParticleSystemCollisionMode.Collision3D;
                collision.collidesWith = EnemyRagdoll.CombatMask;
                collision.quality = ParticleSystemCollisionQuality.Medium;
                collision.enableDynamicColliders = false;
                collision.dampen = .7f; collision.bounce = .03f; collision.lifetimeLoss = 1f;
                collision.sendCollisionMessages = true;
            }
            system.Play(); return system;
        }
        void Burst(Vector3 point, Vector3 normal, Vector3 incoming, bool headshot)
        {
            // Back-spatter follows the entry surface; small variation breaks up a circular puff.
            Vector3 direction = (normal.normalized * .75f - incoming.normalized * .25f).normalized;
            int count = headshot ? 28 : 22;
            for (int i = 0; i < count; i++)
            {
                var p = new ParticleSystem.EmitParams {
                    position = point + normal * .025f + Random.insideUnitSphere * .02f,
                    velocity = (direction + Random.insideUnitSphere * .7f).normalized * Random.Range(1.5f, 5.5f),
                    startLifetime = Random.Range(.28f, .7f), startSize = Random.Range(.013f, .042f),
                    startColor = new Color(Random.Range(.30f,.48f), .012f, .018f, .9f), rotation = Random.Range(0f,360f)
                };
                drops.Emit(p, 1);
            }
            for (int i = 0; i < 6; i++)
            {
                var p = new ParticleSystem.EmitParams {
                    position = point + normal * .035f, velocity = direction * Random.Range(.5f,1.6f) + Random.insideUnitSphere * .6f,
                    startLifetime = Random.Range(.13f,.3f), startSize = Random.Range(.16f,.34f),
                    startColor = new Color(.36f,.015f,.022f,.42f), rotation = Random.Range(0f,360f)
                };
                mist.Emit(p,1);
            }
        }
        public void Collide(GameObject surface)
        {
            // Never attach flat decals to moving animated bodies or floating world-space points.
            if (surface.GetComponentInParent<EnemySoldier>() != null || surface.GetComponentInParent<SniperController>() != null) return;
            int count = drops.GetCollisionEvents(surface, collisions);
            if (count == 0 || Time.time < nextMarkTime) return;
            nextMarkTime = Time.time + .07f;
            var hit = collisions[0];
            int slot = nextMark++ % MaxMarks;
            if (marks[slot] == null)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Quad); go.name = "Surface blood spatter";
                go.transform.SetParent(transform, false); go.layer = 2;
                go.GetComponent<Collider>().enabled = false; Destroy(go.GetComponent<Collider>());
                marks[slot] = go.GetComponent<Renderer>(); marks[slot].sharedMaterial = material;
                marks[slot].shadowCastingMode = ShadowCastingMode.Off;
            }
            var mark = marks[slot]; mark.gameObject.SetActive(true);
            mark.transform.SetPositionAndRotation(hit.intersection + hit.normal * .008f,
                Quaternion.LookRotation(hit.normal) * Quaternion.Euler(0,0,Random.Range(0,360f)));
            mark.transform.localScale = Vector3.one * Random.Range(.09f,.23f);
            markTimes[slot] = Time.time;
            properties.SetColor("_Tint", new Color(.20f, .009f, .015f, .8f));
            mark.SetPropertyBlock(properties);
        }
        void Update()
        {
            for (int i = 0; i < MaxMarks; i++)
            {
                if (marks[i] == null || !marks[i].gameObject.activeSelf) continue;
                float age = Time.time - markTimes[i];
                if (age >= 8f) { marks[i].gameObject.SetActive(false); continue; }
                properties.SetColor("_Tint", new Color(.20f, .009f, .015f, Mathf.Clamp01((8f-age)/2f)*.8f));
                marks[i].SetPropertyBlock(properties);
            }
        }
        static Texture2D Pattern()
        {
            const int size = 128;
            var tex = new Texture2D(size,size,TextureFormat.RGBA32,true) { name = "Irregular blood spatter", wrapMode = TextureWrapMode.Clamp };
            var pixels = new Color[size*size];
            var rng = new System.Random(5921);
            var spots = new Vector3[25];
            spots[0] = new Vector3(.5f,.5f,.20f);
            for (int i = 1; i < spots.Length; i++)
                spots[i] = new Vector3(.1f+(float)rng.NextDouble()*.8f,.1f+(float)rng.NextDouble()*.8f,.012f+(float)rng.NextDouble()*.055f);
            for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
            {
                float u = x/(float)(size-1), v = y/(float)(size-1), alpha = 0;
                foreach (var spot in spots)
                {
                    float distance = new Vector2((u-spot.x)*1.1f,(v-spot.y)*.9f).magnitude / spot.z;
                    float rough = .84f + Mathf.PerlinNoise(u*37f,v*37f)*.32f;
                    alpha = Mathf.Max(alpha, Mathf.Clamp01((rough-distance)*5f));
                }
                pixels[y*size+x] = new Color(1,1,1,alpha);
            }
            tex.SetPixels(pixels); tex.Apply(true,true); return tex;
        }
        void OnDestroy()
        {
            if (instance == this) instance = null;
            if (material != null) Destroy(material);
            if (texture != null) Destroy(texture);
        }
    }
    public sealed class BloodCollisionRelay : MonoBehaviour
    {
        void OnParticleCollision(GameObject other) => GetComponentInParent<BloodImpact>().Collide(other);
    }
}
