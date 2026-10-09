using UnityEngine;

namespace SniperRidge
{
    public sealed class EnemyFlamethrower:MonoBehaviour
    {
        public const float Range=13f;
        public bool Firing { get; private set; }
        EnemySoldier soldier;ParticleSystem flame;Light glow;Material tankMaterial;
        float readyAt,endAt,emitBudget,damageAt;bool primed;
        void Start()
        {
            soldier=GetComponent<EnemySoldier>();
            tankMaterial=new Material(Shader.Find("Standard")){color=new Color(.48f,.1f,.035f)};tankMaterial.SetFloat("_Metallic",.65f);tankMaterial.SetFloat("_Glossiness",.34f);
            // Twin fuel cylinders follow the soldier's torso; the existing two-handed rig holds the nozzle.
            Transform spine=EnemyRagdoll.FindBone(transform,"Spine2");if(!spine)spine=transform;
            for(int i=0;i<2;i++)
            {
                var bottle=GameObject.CreatePrimitive(PrimitiveType.Capsule);bottle.name="Flamethrower fuel cylinder";
                bottle.transform.SetParent(transform);bottle.transform.localPosition=new Vector3(i==0?-.22f:.22f,1.4f,-.32f);
                bottle.transform.localScale=new Vector3(.24f,.43f,.24f);bottle.GetComponent<Collider>().enabled=false;Destroy(bottle.GetComponent<Collider>());
                bottle.GetComponent<Renderer>().sharedMaterial=tankMaterial;bottle.transform.SetParent(spine,true);
            }
            for(int i=0;i<3;i++)
            {
                var nozzle=GameObject.CreatePrimitive(PrimitiveType.Cylinder);nozzle.name="Heat shield nozzle";nozzle.transform.SetParent(soldier.MuzzleTransform,false);
                nozzle.transform.localPosition=new Vector3(0,0,-.08f-i*.11f);nozzle.transform.localRotation=Quaternion.Euler(90,0,0);nozzle.transform.localScale=new Vector3(.17f,.025f,.17f);
                nozzle.GetComponent<Collider>().enabled=false;Destroy(nozzle.GetComponent<Collider>());nozzle.GetComponent<Renderer>().sharedMaterial=tankMaterial;
            }
            var fx=new GameObject("Flamethrower stream");fx.transform.SetParent(transform);flame=fx.AddComponent<ParticleSystem>();flame.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
            var main=flame.main;main.playOnAwake=false;main.loop=true;main.simulationSpace=ParticleSystemSimulationSpace.World;main.maxParticles=450;main.startSize=new ParticleSystem.MinMaxCurve(.18f,.55f);
            var emission=flame.emission;emission.enabled=false;var shape=flame.shape;shape.enabled=false;
            var size=flame.sizeOverLifetime;size.enabled=true;size.size=new ParticleSystem.MinMaxCurve(1,new AnimationCurve(new Keyframe(0,.35f),new Keyframe(.6f,1),new Keyframe(1,1.6f)));
            var color=flame.colorOverLifetime;color.enabled=true;var gradient=new Gradient();gradient.SetKeys(new[]{new GradientColorKey(new Color(1,.94f,.55f),0),new GradientColorKey(new Color(1,.33f,.05f),.5f),new GradientColorKey(new Color(.2f,.12f,.08f),1)},new[]{new GradientAlphaKey(1,0),new GradientAlphaKey(.8f,.6f),new GradientAlphaKey(0,1)});color.color=gradient;
            flame.GetComponent<ParticleSystemRenderer>().sharedMaterial=CombatVfx.FireMaterial;
            glow=fx.AddComponent<Light>();glow.color=new Color(1,.35f,.06f);glow.range=7;glow.intensity=0;flame.Play();
        }
        public static bool InFlame(Vector3 from,Vector3 forward,Vector3 target,Transform owner)
        {
            Vector3 d=target-from;if(d.magnitude>Range||Vector3.Angle(forward,d)>17)return false;
            foreach(var hit in Physics.RaycastAll(from,d.normalized,d.magnitude,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                if(!hit.transform.IsChildOf(owner)&&hit.collider.GetComponentInParent<EnemySoldier>()==null&&hit.collider.GetComponentInParent<SniperController>()==null)return false;
            return true;
        }
        void Update()
        {
            var gm=GameManager.Instance;
            if(!soldier||soldier.IsDead||!soldier.enabled||!gm||!gm.IsPlaying){StopFire();return;}
            var combat=soldier.Combat;if(!combat){StopFire();return;}
            Vector3 from=soldier.Muzzle,target=combat.TargetPoint;bool can=combat.CanShoot&&Vector3.Distance(from,target)<Range;
            if(!primed&&!Firing&&can&&Time.time>=readyAt)
            {primed=true;readyAt=Time.time+.8f;if(combat.TargetsPlayer)gm.Hud.Announce("화염방사병 접근 · 거리를 벌리거나 엄폐하세요");}
            if(primed&&Time.time>=readyAt)
            {primed=false;if(can){Firing=true;endAt=Time.time+2.1f;combat.RecordShot();}else readyAt=Time.time+1;}
            if(Firing&&(Time.time>endAt||!can)){StopFire();readyAt=Time.time+3;}
            if(!Firing)return;
            if(!flame.isPlaying)flame.Play();
            Vector3 direction=(target-from).normalized;float reach=Range;
            foreach(var h in Physics.RaycastAll(from,direction,Range,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                if(!h.transform.IsChildOf(transform)&&h.collider.GetComponentInParent<EnemySoldier>()==null)reach=Mathf.Min(reach,h.distance);
            flame.transform.position=from;glow.intensity=2.5f;emitBudget+=Time.deltaTime*240;
            while(emitBudget>=1){emitBudget--;var e=new ParticleSystem.EmitParams{position=from,velocity=(direction+Random.insideUnitSphere*.06f)*23,startLifetime=Mathf.Max(.02f,reach/23),startSize=Random.Range(.5f,1f)};flame.Emit(e,1);}
            if(Time.time>=damageAt&&InFlame(from,direction,target,transform))
            {damageAt=Time.time+.2f;if(combat.TargetsPlayer)gm.Health.TakeDamage(5);else if(combat.Target&&!combat.Target.IsDead)combat.Target.TakeHit(5,false,direction);}
        }
        void StopFire(){Firing=false;if(glow)glow.intensity=0;}
        void OnDisable(){primed=false;StopFire();if(flame)flame.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);}
        void OnDestroy(){if(tankMaterial)Destroy(tankMaterial);}
    }
}
