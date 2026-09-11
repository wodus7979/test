using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    public static class RocketEffects
    {
        static Material smokeMaterial;
        static Material Material
        {
            get
            {
                if (smokeMaterial != null) return smokeMaterial;
                var texture = new Texture2D(64, 64, TextureFormat.RGBA32, false);
                texture.name = "RocketSoftParticle";
                texture.wrapMode = TextureWrapMode.Clamp;
                var pixels = new Color[64 * 64];
                for (int y = 0; y < 64; y++) for (int x = 0; x < 64; x++)
                {
                    float radius = new Vector2((x - 31.5f) / 31.5f, (y - 31.5f) / 31.5f).magnitude;
                    float alpha = Mathf.Pow(Mathf.Clamp01(1f - radius * radius), 2f);
                    pixels[y * 64 + x] = new Color(1f, 1f, 1f, alpha);
                }
                texture.SetPixels(pixels); texture.Apply(false, true);
                smokeMaterial = new Material(Shader.Find("SniperRidge/RocketParticles"));
                smokeMaterial.mainTexture = texture;
                return smokeMaterial;
            }
        }

        public static void BuildBody(Transform parent)
        {
            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "RocketVisual";
            body.GetComponent<Collider>().enabled = false;
            Object.Destroy(body.GetComponent<Collider>());
            body.transform.SetParent(parent, false);
            body.transform.localScale = new Vector3(.09f, .22f, .09f);
            body.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            body.GetComponent<Renderer>().sharedMaterial = Effects.Unlit(new Color(.35f, .38f, .22f));
            var light = body.AddComponent<Light>();
            light.color = new Color(1f, .45f, .12f); light.intensity = 1.6f; light.range = 3f;
        }

        static ParticleSystem System(string name, Vector3 position, float life, float size, float speed, Color color)
        {
            var go = new GameObject(name);
            go.transform.position = position;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.playOnAwake = false; main.loop = false; main.duration = .1f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startLifetime = new ParticleSystem.MinMaxCurve(life * .65f, life);
            main.startSize = new ParticleSystem.MinMaxCurve(size * .6f, size);
            main.startSpeed = new ParticleSystem.MinMaxCurve(speed * .4f, speed);
            main.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            main.maxParticles = 512; main.startColor = color;
            var emission = ps.emission; emission.enabled = false;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Sphere; shape.radius = .15f;
            var sizeOver = ps.sizeOverLifetime; sizeOver.enabled = true;
            sizeOver.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, .4f, 1f, 2.8f));
            var fade = ps.colorOverLifetime; fade.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(1f, .07f), new GradientAlphaKey(.6f, .5f), new GradientAlphaKey(0f, 1f) });
            fade.color = gradient;
            var renderer = ps.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = Material; renderer.shadowCastingMode = ShadowCastingMode.Off;
            return ps;
        }

        public static ParticleSystem Trail(Transform rocket)
        {
            var ps = System("RocketSmokeTrail", rocket.position, 1.7f, .65f, .25f, new Color(.72f, .69f, .62f, .45f));
            ps.transform.SetParent(rocket, true);
            var main = ps.main; main.loop = true; main.duration = 2f;
            var emission = ps.emission; emission.enabled = true; emission.rateOverTime = 20f; emission.rateOverDistance = 1.2f;
            ps.Play();
            return ps;
        }

        public static ParticleSystem TankDust(Transform tank,Vector3 localPosition)
        {
            var dust=System("Track dust",tank.TransformPoint(localPosition),1.8f,1.1f,.65f,new Color(.52f,.43f,.31f,.22f));
            dust.transform.SetParent(tank,true);
            var main=dust.main;main.loop=true;main.duration=2f;main.maxParticles=96;
            var emission=dust.emission;emission.enabled=true;emission.rateOverTime=0f;
            dust.Play();return dust;
        }

        public static void CannonMuzzle(Vector3 point, Vector3 direction)
        {
            var blast = System("Cannon muzzle blast",point,.16f,1.4f,12f,new Color(1f,.67f,.24f,.85f));
            blast.transform.rotation = Quaternion.LookRotation(direction);
            var shape = blast.shape;shape.shapeType = ParticleSystemShapeType.Cone;shape.angle=20f;
            blast.Play();blast.Emit(14);Object.Destroy(blast.gameObject,.4f);
            var smoke = System("Cannon muzzle smoke",point,1.3f,1.2f,2f,new Color(.55f,.52f,.45f,.4f));
            smoke.Play();smoke.Emit(16);Object.Destroy(smoke.gameObject,1.6f);
        }

        public static void Explosion(Vector3 point)
        {
            var smoke = System("RocketBlastSmoke", point, 2.8f, 2.2f, 5f, new Color(.30f, .27f, .23f, .75f));
            smoke.Play(); smoke.Emit(42); Object.Destroy(smoke.gameObject, 3.2f);
            var fire = System("RocketBlastFlash", point, .4f, 2.8f, 8f, new Color(1f, .46f, .08f, .95f));
            fire.Play(); fire.Emit(16); Object.Destroy(fire.gameObject, .7f);
            Effects.Flash(point, new Color(1f, .55f, .16f), 7f, 16f, .16f);
            for (int i = 0; i < 12; i++)
                Effects.Tracer(point, point + (Random.onUnitSphere + Vector3.up * .3f) * Random.Range(1.5f, 4f),
                    new Color(1f, .63f, .22f), .12f, .035f);
        }
    }
}
