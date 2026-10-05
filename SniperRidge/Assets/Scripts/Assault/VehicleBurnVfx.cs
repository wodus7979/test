using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    // Continuous staged vehicle fire. Shared textures/materials; bounded particles per wreck.
    public sealed class VehicleBurnVfx : MonoBehaviour
    {
        static Material flameMaterial, smokeMaterial;
        readonly List<ParticleSystem> flames=new List<ParticleSystem>();
        ParticleSystem engineSmoke,cabinSmoke;
        Light fireLight;
        bool bus;
        float seed;
        public bool Smoking=>engineSmoke&&engineSmoke.isPlaying;
        public bool Burning=>flames.Count>0&&flames[0]&&flames[0].isPlaying;
        public static VehicleBurnVfx Create(Transform vehicle,Bounds hull)
        {
            var go=new GameObject("Vehicle progressive fire");go.transform.SetParent(vehicle,false);
            var vfx=go.AddComponent<VehicleBurnVfx>();vfx.bus=hull.size.z>7;vfx.seed=Random.value*100;
            EnsureMaterials();
            vfx.engineSmoke=vfx.System("Damaged engine smoke",vfx.Vent(hull,true),smokeMaterial,220);
            return vfx;
        }
        Vector3 Vent(Bounds hull,bool engine)
        {
            float z=engine?(bus?-.36f:.30f):-.10f;
            return new Vector3(hull.center.x,hull.min.y+hull.size.y*(engine&&!bus?.66f:.90f),hull.center.z+hull.size.z*z);
        }
        public void SetDamage(int hits,Bounds hull)
        {
            bool burning=hits>=DestructibleVehicle.PunchesToDestroy;
            engineSmoke.transform.localPosition=Vent(hull,true);
            Smoke(engineSmoke,hits,burning);
            if(!burning||Burning)return;
            var points=new List<Vector3>{Vent(hull,true),Vent(hull,false)};
            if(bus)points.Add(new Vector3(hull.center.x,hull.max.y-.1f,hull.center.z+hull.size.z*.28f));
            foreach(var point in points)Flame(point-Vector3.up*(bus?.25f:.16f));
            if(bus)
                foreach(float side in new[]{-1f,1f})Flame(new Vector3(hull.center.x+side*hull.extents.x*.78f,hull.min.y+hull.size.y*.65f,hull.center.z+hull.size.z*.12f));
            cabinSmoke=System("Black cabin smoke",Vent(hull,false),smokeMaterial,180);Smoke(cabinSmoke,5,true);
            Embers(Vent(hull,false));
            fireLight=new GameObject("Flickering fire light").AddComponent<Light>();fireLight.transform.SetParent(transform,false);
            fireLight.transform.localPosition=hull.center+Vector3.up*.5f;fireLight.type=LightType.Point;
            fireLight.color=new Color(1,.30f,.065f);fireLight.range=bus?10:6;fireLight.shadows=LightShadows.None;
        }
        ParticleSystem System(string label,Vector3 local,Material material,int maximum)
        {
            var go=new GameObject(label);go.transform.SetParent(transform,false);go.transform.localPosition=local;
            var ps=go.AddComponent<ParticleSystem>();ps.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
            var main=ps.main;main.loop=true;main.playOnAwake=false;main.duration=4;main.maxParticles=maximum;
            main.simulationSpace=ParticleSystemSimulationSpace.World;main.cullingMode=ParticleSystemCullingMode.Automatic;
            var shape=ps.shape;shape.shapeType=ParticleSystemShapeType.Cone;shape.rotation=new Vector3(-90,0,0);shape.angle=12;shape.radius=.28f;
            var renderer=ps.GetComponent<ParticleSystemRenderer>();renderer.sharedMaterial=material;renderer.sortMode=ParticleSystemSortMode.Distance;
            renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
            return ps;
        }
        void Smoke(ParticleSystem ps,int hits,bool black)
        {
            var main=ps.main;main.startLifetime=black?new ParticleSystem.MinMaxCurve(4,6):new ParticleSystem.MinMaxCurve(2.5f,3.8f);
            main.startSpeed=black?new ParticleSystem.MinMaxCurve(1.1f,1.9f):new ParticleSystem.MinMaxCurve(.65f,1.05f);
            main.startSize=black?new ParticleSystem.MinMaxCurve(.9f,1.6f):new ParticleSystem.MinMaxCurve(.5f,.8f);
            main.startRotation=new ParticleSystem.MinMaxCurve(0,Mathf.PI*2);
            var emission=ps.emission;emission.rateOverTime=black?(bus?23:17):7+(hits-2)*4;
            var shape=ps.shape;shape.radius=black?.5f:.17f;
            var velocity=ps.velocityOverLifetime;velocity.enabled=true;velocity.space=ParticleSystemSimulationSpace.World;
            velocity.x=.22f;velocity.y=black?.7f:.35f;velocity.z=.12f;
            var noise=ps.noise;noise.enabled=true;noise.strength=black?.45f:.18f;noise.frequency=.45f;noise.scrollSpeed=.35f;noise.octaveCount=2;
            var rotation=ps.rotationOverLifetime;rotation.enabled=true;rotation.z=new ParticleSystem.MinMaxCurve(-.35f,.35f);
            Color start=black?new Color(.033f,.029f,.026f):Color.Lerp(new Color(.48f,.46f,.43f),new Color(.18f,.17f,.15f),(hits-2)/2f);
            Color end=black?new Color(.105f,.10f,.095f):new Color(.42f,.40f,.37f);
            ColorCurve(ps,start,end,black?.88f:.5f);
            var size=ps.sizeOverLifetime;size.enabled=true;size.size=new ParticleSystem.MinMaxCurve(1,AnimationCurve.EaseInOut(0,.45f,1,black?2.6f:2));
            if(!ps.isPlaying){ps.Play();ps.Emit(3);}
        }
        void Flame(Vector3 point)
        {
            var ps=System("Animated wreck flame",point,flameMaterial,70);flames.Add(ps);
            var main=ps.main;main.startLifetime=new ParticleSystem.MinMaxCurve(.65f,1.15f);main.startSpeed=new ParticleSystem.MinMaxCurve(.35f,.85f);
            main.startSize3D=true;main.startSizeX=new ParticleSystem.MinMaxCurve(.65f,1.1f);main.startSizeY=new ParticleSystem.MinMaxCurve(bus?2:1.4f,bus?3:2.1f);main.startSizeZ=1;
            main.startRotation=new ParticleSystem.MinMaxCurve(-.15f,.15f);
            var emission=ps.emission;emission.rateOverTime=22;
            var shape=ps.shape;shape.radius=bus?.48f:.38f;
            var sheet=ps.textureSheetAnimation;sheet.enabled=true;sheet.numTilesX=4;sheet.numTilesY=4;
            sheet.animation=ParticleSystemAnimationType.WholeSheet;sheet.frameOverTime=new ParticleSystem.MinMaxCurve(1,AnimationCurve.Linear(0,0,1,1));sheet.cycleCount=2;
            sheet.startFrame=new ParticleSystem.MinMaxCurve(0,1);
            var noise=ps.noise;noise.enabled=true;noise.strength=.18f;noise.frequency=1.1f;noise.scrollSpeed=.8f;
            ColorCurve(ps,Color.white,new Color(1,.82f,.45f),.85f);
            var size=ps.sizeOverLifetime;size.enabled=true;size.size=new ParticleSystem.MinMaxCurve(1,AnimationCurve.EaseInOut(0,.8f,1,.25f));
            ps.Play();
        }
        void Embers(Vector3 point)
        {
            var ps=System("Rising embers",point,CombatVfx.SparkMaterial,50);var main=ps.main;
            main.startLifetime=new ParticleSystem.MinMaxCurve(.6f,1.7f);main.startSpeed=new ParticleSystem.MinMaxCurve(1.6f,3.5f);main.startSize=new ParticleSystem.MinMaxCurve(.018f,.045f);
            var emission=ps.emission;emission.rateOverTime=bus?14:8;
            var noise=ps.noise;noise.enabled=true;noise.strength=.4f;noise.frequency=.7f;
            ColorCurve(ps,new Color(1,.7f,.12f),new Color(1,.1f,.01f),1);ps.Play();
        }
        static void ColorCurve(ParticleSystem ps,Color start,Color end,float alpha)
        {
            var gradient=new Gradient();gradient.SetKeys(new[]{new GradientColorKey(start,0),new GradientColorKey(end,1)},
                new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(alpha,.13f),new GradientAlphaKey(alpha*.7f,.65f),new GradientAlphaKey(0,1)});
            var colors=ps.colorOverLifetime;colors.enabled=true;colors.color=gradient;
        }
        void Update()
        {
            if(!fireLight)return;
            fireLight.intensity=1.4f+.9f*Mathf.PerlinNoise(seed,Time.time*8)+.2f*Mathf.Sin(Time.time*23);
            var gm=GameManager.Instance;
            if(gm&&gm.PlayerEye)fireLight.enabled=(gm.PlayerEye.position-transform.position).sqrMagnitude<2500;
        }
        static void EnsureMaterials()
        {
            if(flameMaterial&&smokeMaterial)return;
            const int tile=96,atlas=tile*4;
            var flame=new Texture2D(atlas,atlas,TextureFormat.RGBA32,true){name="Vehicle fire · 16 animated frames",wrapMode=TextureWrapMode.Clamp};
            var pixels=new Color[atlas*atlas];
            for(int f=0;f<16;f++)for(int y=0;y<tile;y++)for(int x=0;x<tile;x++)
            {
                float u=(x+.5f)/tile,v=(y+.5f)/tile,phase=f*Mathf.PI/8;
                float n=Mathf.PerlinNoise(u*6+Mathf.Cos(phase),v*9+Mathf.Sin(phase));
                float centre=.5f+.10f*Mathf.Sin(v*10+phase*2)*v;
                float width=(.31f*Mathf.Pow(1-v,.7f)+.025f)*(.65f+.55f*n);
                float a=Mathf.Clamp01((width-Mathf.Abs(u-centre))/width*2)*Mathf.SmoothStep(0,1,v*9)*Mathf.Clamp01((1-v)*10);
                a*=Mathf.Clamp01(n*1.9f+.35f-v*.45f);
                float core=Mathf.Clamp01(1-Mathf.Abs(u-centre)/width*1.3f)*Mathf.Clamp01(1-v*.85f);
                Color c=Color.Lerp(new Color(1,.38f,.02f),new Color(1,1,.68f),core);c.a=a;
                pixels[(f/4*tile+y)*atlas+f%4*tile+x]=c;
            }
            flame.SetPixels(pixels);flame.Apply(true,true);
            flameMaterial=new Material(CombatVfx.FireMaterial){name="Animated vehicle fire",mainTexture=flame};
            const int dim=128;var smoke=new Texture2D(dim,dim,TextureFormat.RGBA32,true){name="Billowing soot",wrapMode=TextureWrapMode.Clamp};pixels=new Color[dim*dim];
            for(int y=0;y<dim;y++)for(int x=0;x<dim;x++)
            {
                float u=(x+.5f)/dim,v=(y+.5f)/dim,r=new Vector2(u*2-1,v*2-1).magnitude;
                float n=Mathf.PerlinNoise(u*7+1.2f,v*7+9.4f)*.7f+Mathf.PerlinNoise(u*17+3,v*17+1)*.3f;
                float a=Mathf.SmoothStep(0,1,Mathf.Clamp01((1-r)*2.8f-(1-n)*.8f))*(.6f+.4f*n);
                pixels[y*dim+x]=new Color(.72f+.28f*n,.72f+.28f*n,.72f+.28f*n,a);
            }
            smoke.SetPixels(pixels);smoke.Apply(true,true);smokeMaterial=new Material(CombatVfx.SmokeMaterial){name="Black vehicle soot",mainTexture=smoke};
        }
    }
}
