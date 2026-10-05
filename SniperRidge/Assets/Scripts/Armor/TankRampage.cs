using System.Collections;
using System.Linq;
using UnityEngine;

namespace SniperRidge
{
    // Owns the transition and synchronized finishers; normal locomotion stays in HulkController.
    [DefaultExecutionOrder(230)]
    public sealed partial class TankRampage : MonoBehaviour
    {
        public bool Escaped { get; private set; }
        public bool Cinematic { get; private set; }
        public bool Busy => Cinematic||action!=null;
        public bool CombatReady=>Escaped&&!Cinematic&&Hero&&Hero.Active&&!Hero.Transforming;
        public RampageProp Held { get; private set; }
        public int AliveHelicopters=>helicopters.Count(h=>h&&!h.Dead);
        public string Prompt=>Cinematic?"전차 탈출 중…":action??(Held?"좌클릭: 나무 타격 · 하늘을 조준하고 E: 던지기 · Q: 내려놓기":"E: 집기 / 포탑 뜯기 / 돌진 반격 · R: 전차 앞부분 들어 던지기");
        public float LastRestrainDistance { get; private set; }
        public int ClimbPlays { get; private set; }
        public int ShellReactions { get; private set; }
        TankBattle battle;
        EnemyAttackHelicopter[] helicopters=new EnemyAttackHelicopter[0];
        float started;
        bool airSpawned;
        string action;
        AnimationClip motion;
        float motionProgress;
        GameObject escapingHuman;
        Transform carriedTurret;
        TankVehicle capturedTank;
        Vector3 cameraFocus,pendingThrowDirection,queuedHit;
        bool hasQueuedHit;
        EnemyAttackHelicopter pendingThrowTarget;
        GameManager GM=>GameManager.Instance;
        HulkController Hero=>GM.Player.Hulk;
        NativeMutantSet Set=>Hero.Visual.Definition;
        public void Initialize(TankBattle owner){battle=owner;started=Time.time;RampageProp.Populate(this);}
        void Update()
        {
            if(!GM||!GM.IsPlaying)return;
            UpdateInfantry();
            if(!airSpawned&&(battle.Stage>=3||Time.time-started>70f||Escaped&&!Cinematic&&Time.time-started>28f))SpawnAirSupport();
        }
        public void SpawnAirSupport()
        {
            if(airSpawned)return;airSpawned=true;helicopters=new EnemyAttackHelicopter[3];
            for(int i=0;i<3;i++)helicopters[i]=EnemyAttackHelicopter.Create(battle,i);
            GM.Hud.Announce("공격 헬기 3대 접근 · 로켓 또는 나무·바위를 던져 격추하세요");
        }
        public void BeginEscape()
        {
            if(Escaped||Cinematic)return;
            Cinematic=true;StartCoroutine(Escape());
        }
        Vector3 Ground(Vector3 p,float lift=.05f){p.y=TerrainGenerator.GroundHeight(GM.Terrain,p.x,p.z)+lift;return p;}
        Vector3 SafeExit(Vector3 center)
        {
            Physics.SyncTransforms();
            for(float radius=7;radius<25;radius+=3)
                for(int i=0;i<16;i++)
                {
                    float a=i*Mathf.PI/8;var p=Ground(center+new Vector3(Mathf.Sin(a),0,Mathf.Cos(a))*radius);
                    if(Mathf.Abs(p.x)>TankBattle.Bounds-3||Mathf.Abs(p.z)>TankBattle.Bounds-3)continue;
                    if(!Physics.CheckCapsule(p+Vector3.up*.9f,p+Vector3.up*2,.84f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))return p;
                }
            return Ground(center+Vector3.back*16);
        }
        bool CanAct()=>Escaped&&!Busy&&GM.IsPlaying&&Hero.Active&&!Hero.Transforming&&Hero.CurrentAttack==HulkController.Attack.None&&Hero.Grounded;
        TankVehicle NearestTank(bool front)
        {
            TankVehicle result=null;float distance=10f;
            foreach(var t in battle.Enemies)
            {
                if(!t||t.IsDead||t.Captured)continue;
                var delta=GM.Player.transform.position-t.transform.position;delta.y=0;
                float d=delta.magnitude;
                if(d>distance||front&&Vector3.Dot(t.transform.forward,delta.normalized)<.40f)continue;
                if(ArmorProjectile.Obstructed(GM.Player.AimPoint,t.AimPoint,GM.Player.transform,t))continue;
                distance=d;result=t;
            }
            return result;
        }
        public bool ClimbNearest()=>StartTankAction(NearestTank(false),false);
        public bool RestrainNearest()=>StartTankAction(NearestTank(true),true);
        public bool StartTankAction(TankVehicle tank,bool restrain,bool counter=false)
        {
            if(!CanAct()||Held||!tank||tank.IsDead||tank.IsPlayer||tank.Captured)return false;
            if(Vector3.Distance(GM.Player.transform.position,tank.transform.position)>11f)return false;
            capturedTank=tank;actionCameraReady=false;tank.Capture();action=restrain?(counter?"돌진 반격 · 버티며 밀려나는 중":"전차 앞부분 붙잡기"):"전차 올라타기";
            Hero.CancelForExternal();StartCoroutine(restrain?ThrowTank(tank,counter):RipTurret(tank));return true;
        }
        void PlaceHero(Vector3 point,Quaternion rotation)
        {
            var c=GM.Player.GetComponent<CharacterController>();c.enabled=false;
            GM.Player.transform.SetPositionAndRotation(point,rotation);c.enabled=true;
        }
        IEnumerator PlayMotion(AnimationClip clip,float seconds,System.Action<float> frame=null)
        {
            motion=clip;motionProgress=0;motionSeconds=seconds;Hero.Visual.BeginExternalMotion();
            for(float t=0;t<seconds;t+=Time.deltaTime)
            {
                if(!GM||!GM.IsPlaying)yield break;
                motionProgress=Mathf.Clamp01(t/seconds);frame?.Invoke(motionProgress);PoseHero();yield return null;
            }
            motionProgress=1;frame?.Invoke(1);PoseHero();
        }
        public void PoseHero()
        {
            if(!Escaped||!Hero||!Hero.Visual||!motion)return;
            Hero.Visual.SampleExternal(motion,Mathf.Lerp(clipFrom,clipTo,motionProgress),Mathf.SmoothStep(0,1,Mathf.Clamp01(motionProgress*motionSeconds/.16f)));
            PoseTurretAction();
            if(capturedTank&&(action=="전차를 막고 밀려나는 중"||action=="전차 앞부분 들어 올리기"))
            {
                foreach(var side in new[]{"Left","Right"})
                {
                    var bones=Hero.Visual.MotionBones;var upper=bones.First(t=>t.name=="mixamorig:"+side+"Arm");var elbow=bones.First(t=>t.name=="mixamorig:"+side+"ForeArm");var hand=bones.First(t=>t.name=="mixamorig:"+side+"Hand");
                    Vector3 grip=capturedTank.transform.TransformPoint(side=="Left"?.6f:-.6f,action=="전차 앞부분 들어 올리기"?.4f:1.1f,3.65f);
                    EnemyAnimationRig.SolveLimb(upper,elbow,hand,grip,elbow.position+GM.Player.transform.right*(side=="Left"?-.3f:.3f));
                }
            }
        }
        IEnumerator ThrowTank(TankVehicle tank,bool counter)
        {
            Vector3 heading=Vector3.ProjectOnPlane(tank.transform.forward,Vector3.up).normalized;
            Quaternion facing=Quaternion.LookRotation(-heading);
            Vector3 tankStart=tank.transform.position,heroStart=Ground(tankStart+heading*6.1f);
            PlaceHero(heroStart,facing);Vector3 end=heroStart;
            // Stop before solid scenery; an unobstructed lane gives the requested ten metres.
            float push=0;
            for(float step=.5f;counter&&step<=10;step+=.5f)
            {
                Vector3 probe=Ground(heroStart+heading*step);
                if(Mathf.Abs(probe.x)>TankBattle.Bounds-2||Mathf.Abs(probe.z)>TankBattle.Bounds-2)break;
                bool blocked=Physics.OverlapCapsule(probe+Vector3.up*.9f,probe+Vector3.up*2,.83f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore).Any(c=>!c.transform.IsChildOf(tank.transform));
                if(blocked)break;push=step;
            }
            yield return PlayMotion(Set.TankRestrain,counter?2.1f:.24f,u=>
            {
                end=Ground(heroStart+heading*(push*Mathf.SmoothStep(0,1,u)));PlaceHero(end,facing);
                tank.transform.position=Ground(tankStart+heading*(push*Mathf.SmoothStep(0,1,u)),.15f);
            });
            LastRestrainDistance=Vector3.ProjectOnPlane(end-heroStart,Vector3.up).magnitude;
            action="전차 앞부분 들어 올리기";var tankBase=tank.transform.position;var rotation=tank.transform.rotation;
            yield return PlayMotion(Set.TankPull,1.4f,u=>
            {tank.transform.position=tankBase+Vector3.up*Mathf.SmoothStep(0,.9f,u);tank.transform.rotation=rotation*Quaternion.Euler(-Mathf.SmoothStep(0,18,u),0,0);});
            action="전차 던지기";bool released=false;
            yield return PlayMotion(Set.TankThrow,.95f,u=>
            {
                if(u>.53f&&!released){released=true;RampageThrownObject.Launch(tank.gameObject,(-heading+Vector3.up*.45f).normalized,38,5,tank,true);Hero.Audio.Play(HulkAudio.Cue.PunchSwing);}
            });
            FinishAction();
        }
        void FinishAction()
        {
            action=null;motion=null;capturedTank=null;turretPhase=TurretPhase.None;
            if(Hero){Hero.CancelForExternal();Hero.Visual.ResetLocomotion();}
            if(hasQueuedHit&&GM.IsPlaying){hasQueuedHit=false;action="포탄 충격 · 뒤로 튕겨남";StartCoroutine(Knockback(queuedHit));}
        }
        public void ShellHit(Vector3 direction)
        {
            if(!CombatReady||!GM.IsPlaying)return;
            GM.Health.TakeDamage(GM.Health.Max*.10f,true);ShellReactions++;
            if(!GM.IsPlaying)return;
            if(Busy){queuedHit=direction;hasQueuedHit=true;return;}
            action="포탄 피격 · 체력 -10%";Hero.CancelForExternal();StartCoroutine(Knockback(direction));
        }
        IEnumerator Knockback(Vector3 direction)
        {
            Vector3 travel=Vector3.ProjectOnPlane(direction,Vector3.up).normalized;
            var c=GM.Player.GetComponent<CharacterController>();
            if(travel.sqrMagnitude>.01f)GM.Player.transform.rotation=Quaternion.LookRotation(-travel);
            motion=Set.ShellHit;motionSeconds=.9f;clipFrom=0;clipTo=1;Hero.Visual.BeginExternalMotion();
            for(float t=0;t<.9f;t+=Time.deltaTime)
            {
                motionProgress=t/.9f;c.Move((travel*Mathf.Lerp(12,0,motionProgress)+Vector3.up*(t<.25f?4:-6))*Time.deltaTime);PoseHero();yield return null;
            }
            FinishAction();
        }
        public void Strike(Vector3 origin,Vector3 forward,float range,float degrees,int hits)
        {
            foreach(var t in battle.Enemies)
            {
                if(!t||t.IsDead||t.Captured)continue;Vector3 delta=t.AimPoint-origin;
                float hullDistance=Mathf.Max(0,Vector3.ProjectOnPlane(delta,Vector3.up).magnitude-3f);
                if(hullDistance>range||Mathf.Abs(delta.y)>7||Vector3.Angle(forward,Vector3.ProjectOnPlane(delta,Vector3.up))>degrees)continue;
                if(ArmorProjectile.Obstructed(origin,t.AimPoint,GM.Player.transform,t))continue;
                t.HeroHit(hits);Effects.Dust(t.AimPoint,-delta.normalized,.7f);Hero.Audio.Play(HulkAudio.Cue.PunchHit,.8f);
            }
        }
        public bool GrabNearest()
        {
            if(!CanAct()||Held)return false;
            var prop=FindObjectsOfType<RampageProp>().Where(p=>p.Available&&Vector3.Distance(p.transform.position,GM.Player.transform.position)<4.7f).OrderBy(p=>Vector3.Distance(p.transform.position,GM.Player.transform.position)).FirstOrDefault();
            if(!prop){GM.Hud.ShowShotFeedback("굵은 나무나 큰 바위에 가까이 다가가세요");return false;}
            action=prop.Tree?"나무 뿌리째 뽑기":"바위 들어 올리기";Hero.CancelForExternal();StartCoroutine(Grab(prop));return true;
        }
        IEnumerator Grab(RampageProp prop)
        {
            bool grabbed=false;
            yield return PlayMotion(Set.Harvesting,1.3f,u=>{if(u>.6f&&!grabbed){grabbed=true;prop.PickUp();Held=prop;Hero.Audio.Play(HulkAudio.Cue.Slam,.75f);Effects.Puff(prop.transform.position,Vector3.up,1,new Color(.33f,.29f,.23f),.6f);}});
            FinishAction();
        }
        public bool SwingHeld()
        {
            if(!CanAct()||!Held)return false;
            if(!Held.Tree)return ThrowHeld();
            action="나무 휘두르기";Hero.CancelForExternal();StartCoroutine(Swing());return true;
        }
        IEnumerator Swing()
        {
            bool hit=false;
            yield return PlayMotion(Set.PoleAttack,.85f,u=>{if(u>.43f&&!hit){hit=true;Strike(GM.Player.AimPoint,GM.Player.transform.forward,8,95,2);Hero.HitInfantryWithProp();Hero.Audio.Play(HulkAudio.Cue.PunchSwing);}});
            FinishAction();
        }
        public EnemyAttackHelicopter FindThrowTarget()
        {
            Vector3 direction=GM.Player.Eye.forward,origin=GM.Player.AimPoint;
            EnemyAttackHelicopter best=null;float angle=16;
            foreach(var h in helicopters)if(h&&!h.Dead)
            {
                Vector3 delta=h.transform.position-origin;float a=Vector3.Angle(direction,delta);
                if(a>=angle)continue;
                bool blocked=ArmorProjectile.Cast(origin,h.transform.position,GM.Player.transform,out var hit);
                if(!blocked||hit.collider.GetComponentInParent<EnemyAttackHelicopter>()==h){best=h;angle=a;}
            }
            return best;
        }
        Vector3 ThrowDirection()
        {
            Vector3 direction=GM.Player.Eye.forward,origin=GM.Player.AimPoint;
            var best=FindThrowTarget();
            if(best)
            {
                float flight=Vector3.Distance(best.transform.position,origin)/60f;
                return (best.transform.position+best.Velocity*flight-origin+Vector3.up*(5*flight*flight)).normalized;
            }
            return (direction+Vector3.up*.10f).normalized;
        }
        public bool ThrowHeld()
        {
            if(!CanAct()||!Held)return false;pendingThrowTarget=FindThrowTarget();pendingThrowDirection=ThrowDirection();action="던지기";Hero.CancelForExternal();StartCoroutine(ThrowProp());return true;
        }
        IEnumerator ThrowProp()
        {
            bool released=false;
            yield return PlayMotion(Set.ThrowIn,.85f,u=>
            {
                if(u>.55f&&!released){released=true;var prop=Held;Held=null;Vector3 direction=pendingThrowDirection;
                    if(pendingThrowTarget&&!pendingThrowTarget.Dead)
                    {
                        // Aim from the real swept-projectile origin at release, not the standing chest.
                        var origin=prop.transform.position+Vector3.up*.5f;
                        var target=pendingThrowTarget.transform.position;
                        var velocity=pendingThrowTarget.isActiveAndEnabled?pendingThrowTarget.Velocity:Vector3.zero;
                        float flight=Vector3.Distance(origin,target)/60f;
                        for(int i=0;i<3;i++)
                        {
                            direction=target+velocity*flight-origin+Vector3.up*(5*flight*flight);
                            flight=direction.magnitude/60f;
                        }
                        direction.Normalize();
                    }
                    pendingThrowTarget=null;
                    RampageThrownObject.Launch(prop.gameObject,direction,60,prop.Tree?4:3,null);Hero.Audio.Play(HulkAudio.Cue.PunchSwing);}
            });FinishAction();
        }
        public void DropHeld(){if(Busy||!Held)return;var p=Held;Held=null;p.Drop(Ground(GM.Player.transform.position+GM.Player.transform.right*3));}
        void LateUpdate()
        {
            if(!GM)return;
            UpdateEscapeCamera();
            if(capturedTank&&Busy&&Escaped)
            {
                Vector3 focus=(GM.Player.transform.position+capturedTank.transform.position)*.5f+Vector3.up*2.2f;
                Vector3 desired=focus+GM.Player.transform.right*9-GM.Player.transform.forward*7+Vector3.up*4;
                desired.y=Mathf.Max(desired.y,TerrainGenerator.GroundHeight(GM.Terrain,desired.x,desired.z)+1.5f);
                UpdateActionCamera(focus,desired);Hero.Visual.SetVisible(true);
            }
            if(Held&&Hero&&Hero.Visual)
            {
                if(!Busy)Hero.Visual.ApplyCarryPose(Held.Tree?Set.PoleAttack:Set.ThrowIn);
                var right=Hero.Visual.MotionBones.First(t=>t.name=="mixamorig:RightHand");
                float swing=action=="나무 휘두르기"?Mathf.Lerp(-85,90,Mathf.SmoothStep(0,1,motionProgress)):0;
                Held.transform.SetPositionAndRotation(right.position,Quaternion.LookRotation(GM.Player.transform.forward)*Quaternion.Euler(0,swing,Held.Tree?100:0));
                if(!Held.Tree)Held.transform.position+=GM.Player.transform.forward*.65f;
            }
        }
        void OnDisable()
        {
            StopAllCoroutines();EndEscapePresentation();if(escapingHuman)Destroy(escapingHuman);if(carriedTurret)Destroy(carriedTurret.gameObject);
            if(capturedTank&&!capturedTank.IsDead)capturedTank.StopVehicle();
            action=null;motion=null;Cinematic=false;
        }
    }
}
