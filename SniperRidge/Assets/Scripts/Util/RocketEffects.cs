using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    public static class RocketEffects
    {
        public const float TankWreckLifetime=18f;
        static Material smokeMaterial,debrisMaterial;
        static Material Material
        {
            get
            {
                if (smokeMaterial != null) return smokeMaterial;
                // 소프트 파티클과 위쪽 조명이 있는 공용 연기 재질을 우선 쓴다.
                smokeMaterial = CombatVfx.SmokeMaterial;
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
            CombatVfx.CannonBlast(point, direction);
        }

        /// <summary>로켓·수류탄·포탄 폭발. scale 1 = 로켓, 1.4 = 전차 포탄, 2.4 = 전차 격파.</summary>
        public static void Explosion(Vector3 point, float scale = 1f)
        {
            CombatVfx.Explosion(point, scale);
        }

        public static void TankDestruction(Transform tank)
        {
            Bounds bounds=new Bounds(tank.position+Vector3.up*1.5f,new Vector3(4,3,8));bool found=false;
            foreach(var renderer in tank.GetComponentsInChildren<MeshRenderer>())
            {
                if(!found){bounds=renderer.bounds;found=true;}else bounds.Encapsulate(renderer.bounds);
            }
            Vector3 centre=bounds.center;
            Explosion(centre,2.4f);
            TankDebris(centre,Mathf.Clamp(bounds.extents.magnitude*.38f,2.2f,4.2f));

            var root=new GameObject("Burning tank wreck");root.transform.position=centre;
            var fire=System("Tank wreck flames",centre+Vector3.up*.2f,1.05f,1.8f,2.8f,new Color(1f,.22f,.025f,.95f));
            fire.transform.SetParent(root.transform,true);
            var fireMain=fire.main;fireMain.loop=true;fireMain.duration=1f;fireMain.maxParticles=180;
            var fireEmission=fire.emission;fireEmission.enabled=true;fireEmission.rateOverTime=34f;
            var fireShape=fire.shape;fireShape.shapeType=ParticleSystemShapeType.Box;fireShape.scale=new Vector3(2.8f,.25f,4.6f);
            fire.GetComponent<ParticleSystemRenderer>().sharedMaterial=CombatVfx.FireMaterial;
            fire.Play();

            var smoke=System("Tank wreck black smoke",centre+Vector3.up*.8f,5.5f,3.1f,2.2f,new Color(.055f,.05f,.045f,.86f));
            smoke.transform.SetParent(root.transform,true);
            var smokeMain=smoke.main;smokeMain.loop=true;smokeMain.duration=1f;smokeMain.maxParticles=220;
            var smokeEmission=smoke.emission;smokeEmission.enabled=true;smokeEmission.rateOverTime=13f;
            var smokeShape=smoke.shape;smokeShape.shapeType=ParticleSystemShapeType.Box;smokeShape.scale=new Vector3(1.7f,.2f,2.8f);
            smoke.Play();

            var sparks=System("Tank wreck sparks",centre+Vector3.up*.5f,1.25f,.11f,7f,new Color(1f,.62f,.12f,.95f));
            sparks.transform.SetParent(root.transform,true);
            var sparkMain=sparks.main;sparkMain.loop=true;sparkMain.duration=1f;sparkMain.maxParticles=72;sparkMain.gravityModifier=.9f;
            var sparkEmission=sparks.emission;sparkEmission.enabled=true;sparkEmission.rateOverTime=6f;
            sparks.GetComponent<ParticleSystemRenderer>().sharedMaterial=CombatVfx.SparkMaterial;
            sparks.Play();

            var glow=root.AddComponent<Light>();glow.type=LightType.Point;glow.color=new Color(1f,.26f,.035f);
            glow.range=14f;glow.intensity=6f;glow.shadows=LightShadows.None;
            root.AddComponent<TankWreckFire>().Initialize(glow);
            Object.Destroy(root,TankWreckLifetime);
        }

        static void TankDebris(Vector3 centre,float radius)
        {
            if(debrisMaterial==null)debrisMaterial=ProceduralAssets.LitMaterial(new Color(.075f,.065f,.055f),.08f);
            for(int i=0;i<14;i++)
            {
                var fragment=GameObject.CreatePrimitive(PrimitiveType.Cube);fragment.name="Burning tank fragment";
                fragment.transform.position=centre+Random.insideUnitSphere*.7f;fragment.transform.rotation=Random.rotation;
                fragment.transform.localScale=new Vector3(Random.Range(.10f,.32f),Random.Range(.05f,.18f),Random.Range(.18f,.55f));
                fragment.GetComponent<Renderer>().sharedMaterial=debrisMaterial;
                var body=fragment.AddComponent<Rigidbody>();body.mass=Random.Range(.4f,1.8f);body.collisionDetectionMode=CollisionDetectionMode.ContinuousDynamic;
                Vector3 direction=(Random.onUnitSphere+Vector3.up*1.1f).normalized;
                body.velocity=direction*Random.Range(radius*1.8f,radius*3.4f);body.angularVelocity=Random.onUnitSphere*Random.Range(4f,12f);
                Object.Destroy(fragment.GetComponent<Collider>(),3f);Object.Destroy(fragment,8f);
            }
        }

        internal static void SecondaryTankExplosion(Vector3 point)
        {
            Explosion(point,1.3f);
            var gm=GameManager.Instance;if(gm!=null&&gm.Armor!=null)gm.Armor.PlayExplosion(point);
        }
    }

    public sealed class TankWreckFire:MonoBehaviour
    {
        Light glow;float started;bool first,second;
        public void Initialize(Light light){glow=light;started=Time.time;}
        void Update()
        {
            float age=Time.time-started;
            if(glow!=null)glow.intensity=(6f+Mathf.Sin(Time.time*17f)*1.7f)*Mathf.Clamp01((RocketEffects.TankWreckLifetime-age)/3f);
            if(!first&&age>.55f){first=true;RocketEffects.SecondaryTankExplosion(transform.position+new Vector3(.8f,.35f,-.6f));}
            if(!second&&age>1.45f){second=true;RocketEffects.SecondaryTankExplosion(transform.position+new Vector3(-.65f,.15f,.9f));}
        }
    }
}
