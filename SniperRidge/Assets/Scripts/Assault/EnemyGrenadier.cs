using UnityEngine;

namespace SniperRidge
{
    [DisallowMultipleComponent]
    public sealed class EnemyGrenadier : MonoBehaviour
    {
        public const float Duration=1.45f,ReleaseTime=.82f;
        public bool Throwing { get; private set; }
        public int Throws { get; private set; }
        EnemySoldier owner;
        EnemyAnimationRig rig;
        float cooldown,age;
        bool released;
        Vector3 target;
        void Start(){owner=GetComponent<EnemySoldier>();rig=GetComponentInChildren<EnemyAnimationRig>();cooldown=Time.time+Random.Range(5,9);}
        public bool TryThrow(Vector3 aim)
        {
            if(!owner)Start();
            if(!owner||owner.IsDead||owner.IsAlly||owner.Boss||!rig||Throwing||Time.time<cooldown)return false;
            float distance=Vector3.Distance(transform.position,aim);if(distance<10||distance>36)return false;
            if(!owner.CanSee(aim))return false;
            // Avoid throwing into an ally's position; the target is locked at the wind-up.
            foreach(var actor in GameManager.Instance.Assault.Soldiers)
                if(actor&&!actor.IsDead&&!actor.IsAlly&&actor!=owner&&Vector3.Distance(actor.AimPoint,aim)<7)return false;
            if(!GrenadeTrajectory.TryLaunch(owner.Head.position+transform.forward*.6f,aim,out _))return false;
            if(!rig.BeginGrenade())return false;
            target=aim-Vector3.up*1.1f;age=0;released=false;Throwing=true;cooldown=Time.time+Random.Range(10,15);return true;
        }
        void Update()
        {
            var gm=GameManager.Instance;if(!gm||!gm.IsPlaying||!owner)return;
            if(owner.IsDead){Throwing=false;return;}
            if(!Throwing){if(owner.Combat!=null&&owner.Combat.CanShoot)TryThrow(owner.Combat.TargetPoint);return;}
            age+=Time.deltaTime;
            if(!released&&age>=ReleaseTime)
            {
                released=true;Vector3 point=rig.GrenadeHand+transform.forward*.35f;
                if(GrenadeTrajectory.TryLaunch(point,target,out var velocity))
                {EnemyGrenade.Launch(owner,point,velocity);Throws++;owner.Combat.RecordShot();}
            }
            if(age>=Duration)Throwing=false;
        }
    }
    public sealed class EnemyGrenade : MonoBehaviour
    {
        GrenadeTrajectory.State state;
        EnemySoldier shooter;
        float accumulator;int steps;
        Transform visual;
        public static void Launch(EnemySoldier owner,Vector3 from,Vector3 velocity)
        {
            var go=new GameObject("Enemy live grenade");go.transform.position=from;
            var g=go.AddComponent<EnemyGrenade>();g.shooter=owner;g.state=new GrenadeTrajectory.State{Position=from,Velocity=velocity};
            var model=GrenadeProjectile.CreateVisual(go.transform);if(model){g.visual=model.transform;g.visual.localScale*=2;}
            var ring=go.AddComponent<LineRenderer>();ring.positionCount=25;ring.loop=true;ring.useWorldSpace=false;
            ring.startWidth=ring.endWidth=.035f;ring.sharedMaterial=CombatVfx.SparkMaterial;
            ring.startColor=ring.endColor=new Color(1,.15f,.015f);
            for(int i=0;i<25;i++){float a=i*Mathf.PI*2/25;ring.SetPosition(i,new Vector3(Mathf.Cos(a),.12f,Mathf.Sin(a))*.25f);}
            var gm=GameManager.Instance;if(Vector3.Distance(from,gm.Player.transform.position)<40)gm.Hud.ShowShotFeedback("적 수류탄! · 폭발 범위에서 벗어나세요");
        }
        void LateUpdate()
        {
            var gm=GameManager.Instance;if(!gm||!gm.IsPlaying){Destroy(gameObject);return;}
            accumulator+=Time.deltaTime;
            while(accumulator>=GrenadeTrajectory.StepSeconds&&steps<GrenadeTrajectory.FuseSteps)
            {GrenadeTrajectory.Step(ref state);accumulator-=GrenadeTrajectory.StepSeconds;steps++;}
            transform.position=state.Position;if(visual&&!state.Resting)visual.Rotate(new Vector3(360,180,80)*Time.deltaTime);
            if(steps<GrenadeTrajectory.FuseSteps)return;
            RocketEffects.Explosion(state.Position);gm.PlaySound(gm.Sounds.RocketExplosion,.65f);
            foreach(var hit in RocketProjectile.FindBlastTargets(state.Position,95))
                if(hit.Key.IsAlly)hit.Key.TakeHit(hit.Value,false,(hit.Key.AimPoint-state.Position).normalized);
            float distance=Vector3.Distance(state.Position,gm.Player.AimPoint);
            if(distance<RocketProjectile.BlastRadius&&!EnemyProjectile.WorldHit(state.Position,gm.Player.AimPoint,shooter,out _))
                gm.Health.TakeDamage(RocketProjectile.BlastDamage(distance,60));
            Destroy(gameObject);
        }
    }
}
