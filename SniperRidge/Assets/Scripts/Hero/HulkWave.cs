using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    // The pressure front, dust emission and damage use one propagation clock.
    public sealed class HulkWave : MonoBehaviour
    {
        public const float PropagationDuration=.8f, Lifetime=3.2f;
        const int Segments=72, DustSteps=16;
        public static float RadiusAt(float age,float range)=>range*Mathf.Clamp01(age/PropagationDuration);
        public float CurrentRadius => RadiusAt(age,radius);
        public int DustEmitted { get; private set; }
        public int DebrisEmitted { get; private set; }
        public bool Directional => cone;
        public int ParticleLimit => 480;
        static Material pressureMaterial,dustMaterial;
        static AudioClip rumble;
        readonly RaycastHit[] hits=new RaycastHit[32];
        readonly Vector3[] rays=new Vector3[Segments+1];
        readonly float[] stops=new float[Segments+1];
        readonly Vector3[] vertices=new Vector3[(Segments+1)*2],normals=new Vector3[(Segments+1)*2];
        readonly Color[] colors=new Color[(Segments+1)*2];
        Vector3 origin,forward,right;
        float radius,age;
        int dustStep;
        bool cone;
        Mesh mesh;
        MeshRenderer pressure;
        ParticleSystem dust,chips;
        public float LimitAt(int index)=>stops[Mathf.Clamp(index,0,Segments)];
        public static HulkWave Create(Vector3 point,Vector3 direction,float range,bool directional)
        {
            var wave=new GameObject(directional?"Thunderclap pressure wave":"Ground slam shockwave").AddComponent<HulkWave>();
            wave.origin=point;wave.forward=Vector3.ProjectOnPlane(direction,Vector3.up).normalized;
            if(wave.forward.sqrMagnitude<.1f)wave.forward=Vector3.forward;
            wave.right=Vector3.Cross(Vector3.up,wave.forward);wave.radius=range;wave.cone=directional;
            wave.Build();return wave;
        }
        void Build()
        {
            for(int i=0;i<=Segments;i++)
            {
                float angle=(cone?Mathf.Lerp(-65,65,i/(float)Segments):i*360f/Segments)*Mathf.Deg2Rad;
                rays[i]=forward*Mathf.Cos(angle)+right*Mathf.Sin(angle);stops[i]=radius;
                int count=Physics.RaycastNonAlloc(origin,rays[i],hits,radius,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
                for(int h=0;h<count;h++)if(IsSurface(hits[h].collider))stops[i]=Mathf.Min(stops[i],Mathf.Max(0,hits[h].distance-.05f));
            }
            if(!pressureMaterial)
            {
                var shader=Resources.Load<Shader>("Shaders/HulkPressure");
                if(shader&&shader.isSupported)pressureMaterial=new Material(shader){name="Air pressure refraction"};
            }
            mesh=new Mesh{name="Expanding pressure front"};mesh.MarkDynamic();
            var uv=new Vector2[vertices.Length];var triangles=new int[Segments*6];
            for(int i=0;i<=Segments;i++){uv[i*2]=new Vector2(i/(float)Segments,0);uv[i*2+1]=new Vector2(i/(float)Segments,1);}
            for(int i=0;i<Segments;i++){int v=i*2,t=i*6;triangles[t]=v;triangles[t+1]=v+1;triangles[t+2]=v+2;triangles[t+3]=v+1;triangles[t+4]=v+3;triangles[t+5]=v+2;}
            mesh.vertices=vertices;mesh.uv=uv;mesh.triangles=triangles;
            gameObject.AddComponent<MeshFilter>().sharedMesh=mesh;
            pressure=gameObject.AddComponent<MeshRenderer>();pressure.sharedMaterial=pressureMaterial;pressure.enabled=pressureMaterial;
            pressure.shadowCastingMode=ShadowCastingMode.Off;pressure.receiveShadows=false;
            dust=MakeParticles("Rolling ground dust",DustMaterial(),400,false);
            chips=MakeParticles("Loose stone fragments",CombatVfx.DebrisMaterial,80,true);
            EmitInitial();RenderFront();
            CameraShake.Impulse(origin,cone?24:18,cone?.55f:.72f);
            PlayRumble();
        }
        static bool IsSurface(Collider c)=>c&&c.GetComponentInParent<SniperController>()==null&&c.GetComponentInParent<EnemySoldier>()==null;
        bool Ground(Vector3 point,out Vector3 ground,out Vector3 normal)
        {
            ground=point;normal=Vector3.up;float nearest=float.PositiveInfinity;
            int count=Physics.RaycastNonAlloc(point+Vector3.up*4,Vector3.down,hits,10,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
            for(int i=0;i<count;i++)if(IsSurface(hits[i].collider)&&hits[i].normal.y>.35f&&hits[i].distance<nearest)
            {nearest=hits[i].distance;ground=hits[i].point;normal=hits[i].normal;}
            return nearest<float.PositiveInfinity;
        }
        ParticleSystem MakeParticles(string label,Material material,int budget,bool debris)
        {
            var go=new GameObject(label);go.transform.SetParent(transform,false);var ps=go.AddComponent<ParticleSystem>();
            ps.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
            var main=ps.main;main.playOnAwake=false;main.loop=false;main.duration=Lifetime;main.simulationSpace=ParticleSystemSimulationSpace.World;
            main.maxParticles=budget;main.gravityModifier=debris?1.2f:-.025f;main.startSpeed=0;
            var emission=ps.emission;emission.enabled=false;var shape=ps.shape;shape.enabled=false;
            var color=ps.colorOverLifetime;color.enabled=true;var gradient=new Gradient();
            gradient.SetKeys(new[]{new GradientColorKey(Color.white,0),new GradientColorKey(Color.white,1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(debris?1:.75f,.08f),new GradientAlphaKey(debris?1:.42f,.4f),new GradientAlphaKey(0,1)});color.color=gradient;
            var size=ps.sizeOverLifetime;size.enabled=true;size.size=new ParticleSystem.MinMaxCurve(1,AnimationCurve.Linear(0,debris?1:.45f,1,debris?.6f:2.2f));
            var drag=ps.limitVelocityOverLifetime;drag.enabled=true;drag.limit=debris?12:1.4f;drag.dampen=debris?.02f:.16f;
            var spin=ps.rotationOverLifetime;spin.enabled=true;spin.z=new ParticleSystem.MinMaxCurve(debris?-8:-.5f,debris?8:.5f);
            if(debris){var collision=ps.collision;collision.enabled=true;collision.type=ParticleSystemCollisionType.World;collision.mode=ParticleSystemCollisionMode.Collision3D;collision.quality=ParticleSystemCollisionQuality.Low;collision.collidesWith=EnemyRagdoll.CombatMask;collision.bounce=.25f;collision.dampen=.55f;collision.lifetimeLoss=.2f;collision.enableDynamicColliders=false;}
            var r=ps.GetComponent<ParticleSystemRenderer>();r.sharedMaterial=material;r.sortMode=ParticleSystemSortMode.Distance;r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;
            ps.Play();return ps;
        }
        void EmitInitial()
        {
            for(int i=0;i<48;i++)
            {
                int j=Mathf.RoundToInt(i/(float)47*Segments);Vector3 direction=rays[j];
                float distance=Random.Range(.12f,.7f);
                if(distance>stops[j]||!Ground(origin+direction*distance,out var p,out var n))continue;
                var e=new ParticleSystem.EmitParams{position=p+n*.09f,velocity=direction*Random.Range(3,7)+Vector3.up*Random.Range(2,5),startSize=Random.Range(.045f,.13f),startLifetime=Random.Range(.65f,1.5f),startColor=new Color(.35f,.32f,.27f),rotation=Random.Range(0,360)};
                chips.Emit(e,1);DebrisEmitted++;
            }
        }
        static Material DustMaterial()
        {
            if(dustMaterial)return dustMaterial;
            // Fractal density and a warped silhouette break up billboard circles into wisps.
            const int size=128;
            var texture=new Texture2D(size,size,TextureFormat.RGBA32,true){name="Pressure dust wisps",wrapMode=TextureWrapMode.Clamp,filterMode=FilterMode.Bilinear};
            var pixels=new Color[size*size];
            for(int y=0;y<size;y++)for(int x=0;x<size;x++)
            {
                float u=(x+.5f)/size,v=(y+.5f)/size;
                float broad=Mathf.PerlinNoise(u*5.2f+13.7f,v*5.2f+4.1f);
                float fine=Mathf.PerlinNoise(u*17+2.8f,v*17+11.6f);
                float radius=new Vector2((u-.5f)*2,(v-.5f)*2).magnitude;
                float edge=Mathf.SmoothStep(0,1,Mathf.Clamp01((1-radius)*3+(broad-.5f)*2));
                float density=Mathf.Clamp01((broad*.7f+fine*.3f-.27f)*2.1f);
                float shade=.72f+density*.28f;
                pixels[y*size+x]=new Color(shade,shade,shade,edge*density);
            }
            texture.SetPixels(pixels);texture.Apply(true,true);
            dustMaterial=new Material(CombatVfx.SmokeMaterial){name="Ground pressure dust",mainTexture=texture};
            return dustMaterial;
        }
        static float Scatter(int step,int index,int channel)
        {
            uint value=(uint)(step*73856093)^((uint)index*19349663u)^((uint)channel*83492791u);
            value=(value^(value>>16))*2246822519u;value^=value>>13;
            return (value&65535)/65535f;
        }
        void EmitDust(float progress)
        {
            const int count=24;
            for(int i=0;i<count;i++)
            {
                float fraction=(i+Scatter(dustStep,i,1))/count;
                float angle=(cone?Mathf.Lerp(-65,65,fraction):360*fraction)*Mathf.Deg2Rad;
                Vector3 direction=forward*Mathf.Cos(angle)+right*Mathf.Sin(angle);
                float distance=radius*Mathf.Max(0,progress-Scatter(dustStep,i,2)/DustSteps);
                // Test each irregular ray so dust cannot appear on the far side of a wall.
                int hitCount=Physics.RaycastNonAlloc(origin,direction,hits,distance,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
                bool blocked=false;for(int j=0;j<hitCount;j++)if(IsSurface(hits[j].collider)){blocked=true;break;}
                if(blocked||!Ground(origin+direction*distance,out var p,out var n))continue;
                float noise=Scatter(dustStep,i,3),spin=Scatter(dustStep,i,4);
                Vector3 tangent=Vector3.Cross(n,direction);
                var e=new ParticleSystem.EmitParams{
                    position=p+n*Mathf.Lerp(.08f,.35f,noise),
                    velocity=direction*Mathf.Lerp(3.8f,.7f,progress)+tangent*(noise-.5f)+n*Mathf.Lerp(.2f,.8f,spin),
                    startSize=Mathf.Lerp(1.1f,2.5f,progress)*Mathf.Lerp(.75f,1.35f,noise),
                    startLifetime=Mathf.Lerp(1.2f,1.85f,spin),startColor=new Color(.57f,.54f,.48f,Mathf.Lerp(.65f,.38f,progress)),rotation=spin*360};
                dust.Emit(e,1);DustEmitted++;
            }
        }
        void RenderFront()
        {
            if(age>PropagationDuration+.1f){pressure.enabled=false;return;}
            float r=CurrentRadius,width=Mathf.Lerp(.28f,.95f,r/radius),fade=Mathf.SmoothStep(1,0,age/(PropagationDuration+.1f));
            for(int i=0;i<=Segments;i++)
            {
                float reach=Mathf.Min(r,stops[i]);Vector3 center=origin+rays[i]*reach;
                bool floor=Ground(center,out var ground,out var normal);
                float alpha=(r<=stops[i]+.2f?1:0)*fade*(cone?Mathf.Sin(i/(float)Segments*Mathf.PI):1);
                for(int side=0;side<2;side++)
                {
                    int v=i*2+side;
                    if(cone)vertices[v]=new Vector3(center.x,origin.y+(side==0?-.8f:.8f),center.z);
                    else vertices[v]=(floor?ground:center)+Vector3.up*.09f-rays[i]*(side==0?width:0);
                    normals[v]=rays[i];colors[v]=new Color(.79f,.84f,.79f,alpha*(cone?.65f:.85f));
                }
            }
            mesh.vertices=vertices;mesh.normals=normals;mesh.colors=colors;mesh.RecalculateBounds();
        }
        public void Advance(float dt)
        {
            age+=Mathf.Max(0,dt);
            while(dustStep<DustSteps&&age>=(dustStep+1)*PropagationDuration/DustSteps){dustStep++;EmitDust(dustStep/(float)DustSteps);}
            RenderFront();
            if(age>=Lifetime)Destroy(gameObject);
        }
        void Update()
        {
            if(GameManager.Instance&&!GameManager.Instance.IsPlaying){Destroy(gameObject);return;}
            Advance(Time.deltaTime);
        }
        void PlayRumble()
        {
            if(!rumble)
            {
                const int rate=22050;var samples=new float[rate*2];var random=new System.Random(431);float low=0;
                for(int i=0;i<samples.Length;i++)
                {float t=i/(float)rate;low=Mathf.Lerp(low,(float)random.NextDouble()*2-1,.055f);float envelope=Mathf.Min(1,t/.008f)*Mathf.Exp(-t*4.6f);samples[i]=(Mathf.Sin(t*(70-t*12)*Mathf.PI*2)*.3f+low*.7f)*envelope;}
                rumble=AudioClip.Create("Pressure low rumble",samples.Length,1,rate,false);rumble.SetData(samples,0);
            }
            var audioObject=new GameObject("Pressure rumble");audioObject.transform.SetParent(transform);audioObject.transform.position=origin;
            var sound=audioObject.AddComponent<AudioSource>();sound.playOnAwake=false;sound.spatialBlend=.65f;sound.rolloffMode=AudioRolloffMode.Linear;sound.minDistance=3;sound.maxDistance=30;sound.volume=.5f;sound.clip=rumble;sound.Play();
        }
        void OnDestroy(){if(mesh)Destroy(mesh);}
    }
}
