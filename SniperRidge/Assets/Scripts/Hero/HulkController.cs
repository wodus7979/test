using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace SniperRidge
{
    /// <summary>City-only transformation. The player, health and mission remain the same objects.</summary>
    public sealed class HulkController : MonoBehaviour
    {
        public enum Attack { None, Punch, Clap, Slam }
        public bool Active { get; private set; }
        public const float TransformDuration=1.8f;
        public const float WalkSpeed=2.4f, RunSpeed=11f;
        public bool RunEnabled { get; private set; }
        public bool Sprinting { get; private set; }
        public float PlanarSpeed { get; private set; }
        Vector3 horizontalVelocity,actualVelocity;
        float turnRate,acceleration;
        int lastFootstep;
        public bool ToggleRun()
        {
            if(!Active || Transforming || Game==null || !Game.IsPlaying || CurrentAttack!=Attack.None)return false;
            RunEnabled=!RunEnabled;return true;
        }
        public const float PunchDuration=.72f, PunchImpactTime=.28f, JumpWindup=.22f;
        public bool PunchLeft { get; private set; }
        bool nextPunchLeft,slamLaunched;
        public float JumpVelocity => vertical;
        public bool JumpLaunched => slamLaunched;
        public bool Transforming => Active && Time.time<transformedAt+TransformDuration;
        public float TransformationProgress => Mathf.Clamp01((Time.time-transformedAt)/TransformDuration);
        public HulkAudio Audio { get; private set; }
        public HulkVisual Visual => visual;
        float transformedAt=-99;
        bool swingPlayed;
        public Attack CurrentAttack { get; private set; }
        public float AttackAge => Time.time-actionAt;
        public float ClapCooldown => Mathf.Max(0,clapAt-Time.time);
        public float SlamCooldown => Mathf.Max(0,slamAt-Time.time);
        public const float Height=3.5f, Radius=.65f;
        public bool Grounded => capsule.isGrounded;
        public int DamageEvents { get; private set; }
        public int Landings { get; private set; }
        SniperController owner;
        CharacterController capsule;
        HulkVisual visual;
        Canvas canvas;
        Button transformButton;
        readonly List<Button> skills=new List<Button>();
        readonly HashSet<EnemySoldier> waveHit=new HashSet<EnemySoldier>();
        float yaw,pitch=15,vertical,actionAt,punchAt,clapAt,slamAt,waveStart=-99,waveRadius,inputAfter;
        bool impactDone,airborne;
        Vector3 waveOrigin,waveForward;
        Attack waveAttack;

        GameManager Game => GameManager.Instance;
        public static HulkController Attach(SniperController player)
        {
            var h=player.gameObject.AddComponent<HulkController>();h.owner=player;
            h.capsule=player.GetComponent<CharacterController>();h.Audio=player.gameObject.AddComponent<HulkAudio>();h.BuildUi();return h;
        }
        public bool Toggle()
        {
            if(Game==null || !Game.IsPlaying || !owner.IsFreeRoam || Transforming || CurrentAttack!=Attack.None ||
                owner.State!=SniperController.WeaponState.Ready || (!Grounded && Active))return false;
            if(!Active && Physics.CheckCapsule(transform.position+Vector3.up*(Radius+.08f),
                transform.position+Vector3.up*(Height-Radius),Radius,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
            {Game.Hud.ShowShotFeedback("변신할 공간이 부족합니다 · 넓은 곳으로 이동하세요");return false;}
            if(!Active && visual==null)
            {
                visual=HulkVisual.Create(transform);
                if(visual==null){Game.Hud.ShowShotFeedback("헐크 에셋이 없습니다 · 에셋 재생성을 실행하세요");return false;}
            }
            Active=!Active;Game.Health.SetHulkForm(Active);RunEnabled=false;Sprinting=false;horizontalVelocity=actualVelocity=Vector3.zero;PlanarSpeed=0;vertical=-2;waveStart=-99;waveHit.Clear();
            if(Active)
            {
                nextPunchLeft=false;PunchLeft=false;
                visual.ResetLocomotion();lastFootstep=visual.FootstepSerial;
                transformedAt=Time.time;Audio.Play(HulkAudio.Cue.Transform);
                visual.gameObject.SetActive(true);visual.Pose(0,Attack.None,0,Grounded,false,0);yaw=transform.eulerAngles.y;pitch=15;
                capsule.height=Height;capsule.radius=Radius;capsule.center=Vector3.up*Height*.5f;capsule.stepOffset=.45f;
            }
            else {Audio.Stop();visual.gameObject.SetActive(false);FpsMovement.Configure(capsule);owner.FreeMovement.ResetPose();}
            owner.SetHulkView(Active);LockInput();
            Effects.Puff(transform.position+Vector3.up*.2f,Vector3.up,1.5f,new Color(.48f,.52f,.35f),.7f);
            Game.Hud.Announce(Active?"헐크 변신 · 왕을 향해 돌파하세요":"FPS 모드로 복귀");
            return true;
        }
        public bool BeginAttack(Attack attack)
        {
            if(!Active || Transforming || Game==null || !Game.IsPlaying || CurrentAttack!=Attack.None || !Grounded)return false;
            if(attack==Attack.None || attack==Attack.Punch&&Time.time<punchAt || attack==Attack.Clap&&Time.time<clapAt || attack==Attack.Slam&&Time.time<slamAt)return false;
            CurrentAttack=attack;actionAt=Time.time;impactDone=false;swingPlayed=false;
            if(attack==Attack.Punch)
            {PunchLeft=nextPunchLeft;nextPunchLeft=!nextPunchLeft;visual.PunchLeft=PunchLeft;punchAt=Time.time+PunchDuration;}
            if(attack==Attack.Clap)clapAt=Time.time+4f;
            if(attack==Attack.Slam){slamAt=Time.time+6f;slamLaunched=false;airborne=false;}
            return true;
        }
        public void Tick(float dt)
        {
            bool playing=Game!=null && Game.IsPlaying;
            canvas.gameObject.SetActive(playing);
            if(!playing){Audio.Stop();RunEnabled=false;Sprinting=false;horizontalVelocity=Vector3.zero;return;}
            if(Input.GetKeyDown(KeyCode.H))Toggle();
            transformButton.interactable=!Transforming && CurrentAttack==Attack.None;
            transformButton.GetComponentInChildren<Text>().text=Transforming?"변신 중…":Active?"[H] 인간으로 복귀":"[H] 헐크 변신";
            foreach(var button in skills)button.gameObject.SetActive(Active);
            if(!Active)return;
            skills[0].interactable=!Transforming&&CurrentAttack==Attack.None&&Grounded;
            skills[1].interactable=!Transforming&&CurrentAttack==Attack.None&&Grounded&&ClapCooldown<=0;
            skills[3].interactable=!Transforming&&CurrentAttack==Attack.None;
            skills[3].GetComponentInChildren<Text>().text=RunEnabled?"[Shift] 달리기 켜짐":"[Shift] 달리기";
            skills[2].interactable=!Transforming&&CurrentAttack==Attack.None&&Grounded&&SlamCooldown<=0;
            skills[1].GetComponentInChildren<Text>().text=ClapCooldown>0?"박수 충격파 "+ClapCooldown.ToString("0.0")+"초":"[우클릭] 박수 충격파";
            skills[2].GetComponentInChildren<Text>().text=SlamCooldown>0?"점프 강타 "+SlamCooldown.ToString("0.0")+"초":"[Space] 점프 강타";
            if(Input.GetKeyDown(KeyCode.Escape)){Cursor.lockState=CursorLockMode.None;Cursor.visible=true;}
            bool keys=Cursor.lockState==CursorLockMode.Locked&&Time.time>=inputAfter&&!Transforming;
            if(!keys&&Input.GetMouseButtonDown(0)&&(EventSystem.current==null||!EventSystem.current.IsPointerOverGameObject()))LockInput();
            if(keys)
            {
                yaw+=Input.GetAxis("Mouse X")*owner.MouseSensitivity;
                pitch=Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*owner.MouseSensitivity,-12,55);
                if(Input.GetMouseButton(0))BeginAttack(Attack.Punch);
                if(Input.GetMouseButtonDown(1))BeginAttack(Attack.Clap);
                if(Input.GetKeyDown(KeyCode.Space))BeginAttack(Attack.Slam);
            }
            Vector2 movement=keys?new Vector2((Input.GetKey(KeyCode.D)?1:0)-(Input.GetKey(KeyCode.A)?1:0),
                (Input.GetKey(KeyCode.W)?1:0)-(Input.GetKey(KeyCode.S)?1:0)):Vector2.zero;
            Move(movement,dt,keys&&(Input.GetKey(KeyCode.LeftShift)||Input.GetKey(KeyCode.RightShift)));
            AdvanceAttack();AdvanceWave();
            float speed=PlanarSpeed;
            visual.SetMotion(transform.InverseTransformDirection(actualVelocity),turnRate,acceleration);
            visual.SetJumpMotion(vertical,slamLaunched);
            visual.Pose(speed,CurrentAttack,AttackAge,Grounded,impactDone,Transforming?TransformationProgress:-1);
            if(visual.FootstepSerial!=lastFootstep&&speed>.8f&&Grounded)Audio.Play(HulkAudio.Cue.Footstep,Sprinting?.48f:.32f);
            lastFootstep=visual.FootstepSerial;
        }
        // Shared by keyboard input and editor play-mode validation.
        public void Move(Vector2 input,float dt,bool sprint=false)
        {
            if(!Active || Game==null || !Game.IsPlaying || dt<=0)return;
            float previousYaw=transform.eulerAngles.y;
            transform.rotation=Quaternion.RotateTowards(transform.rotation,Quaternion.Euler(0,yaw,0),420*dt);
            turnRate=Mathf.DeltaAngle(previousYaw,transform.eulerAngles.y)/dt;
            input=Transforming?Vector2.zero:Vector2.ClampMagnitude(input,1);
            if(CurrentAttack==Attack.Slam&&!slamLaunched)
            {
                input=Vector2.zero;horizontalVelocity=Vector3.zero;
                if(AttackAge>=JumpWindup&&Grounded){vertical=13;slamLaunched=true;Audio.Play(HulkAudio.Cue.Jump);}
            }
            if(Grounded&&vertical<0)vertical=-2;
            vertical=Mathf.Max(-30,vertical-26*dt);
            Sprinting=!Transforming&&CurrentAttack==Attack.None&&(RunEnabled||sprint)&&input.sqrMagnitude>.01f;
            float speed=CurrentAttack==Attack.Clap?2f:CurrentAttack==Attack.Punch?4.5f:Sprinting?RunSpeed:WalkSpeed;
            Vector3 desired=Quaternion.Euler(0,yaw,0)*new Vector3(input.x,0,input.y)*speed;
            float rate=desired.sqrMagnitude<horizontalVelocity.sqrMagnitude?34:24;
            horizontalVelocity=Vector3.MoveTowards(horizontalVelocity,desired,rate*dt);
            Vector3 before=transform.position;float previousSpeed=PlanarSpeed;
            CollisionFlags flags=capsule.Move((horizontalVelocity+Vector3.up*vertical)*dt);
            actualVelocity=Vector3.ProjectOnPlane(transform.position-before,Vector3.up)/dt;
            PlanarSpeed=actualVelocity.magnitude;
            acceleration=Mathf.Lerp(acceleration,(PlanarSpeed-previousSpeed)/dt,1-Mathf.Exp(-10*dt));
            // Keep momentum tangent to walls instead of storing speed into an obstacle.
            if((flags&CollisionFlags.Sides)!=0)horizontalVelocity=actualVelocity;
            if((flags&CollisionFlags.Above)!=0&&vertical>0)vertical=0;
            if(CurrentAttack==Attack.Slam)
            {
                if(slamLaunched&&!Grounded)airborne=true;
                if(airborne&&Grounded&&vertical<0&&!impactDone)
                {impactDone=true;Landings++;StartWave(Attack.Slam);actionAt=Time.time;Audio.Play(HulkAudio.Cue.Slam);}
                // A low ceiling may prevent take-off. Never leave the attack locked forever.
                if(!airborne&&AttackAge>1f){CurrentAttack=Attack.None;}
            }
        }
        void AdvanceAttack()
        {
            float age=AttackAge;
            if(CurrentAttack==Attack.Punch)
            {
                if(!swingPlayed&&age>=.12f){swingPlayed=true;Audio.Play(HulkAudio.Cue.PunchSwing,.8f);}
                if(!impactDone&&age>=PunchImpactTime)
                {
                    int before=DamageEvents;
                    impactDone=true;HitTargets(transform.position+Vector3.up*1.6f,transform.forward,3.8f,60,145,null,2.8f);
                    Effects.Puff(transform.TransformPoint(PunchLeft?.5f:-.5f,1.9f,1.3f),transform.forward,.35f,new Color(.7f,.75f,.55f),.2f);if(DamageEvents>before)Audio.Play(HulkAudio.Cue.PunchHit);
                }
                if(age>PunchDuration)CurrentAttack=Attack.None;
            }
            else if(CurrentAttack==Attack.Clap)
            {
                if(!impactDone&&age>=.43f){impactDone=true;StartWave(Attack.Clap);Audio.Play(HulkAudio.Cue.Clap);}
                if(age>.95f)CurrentAttack=Attack.None;
            }
            else if(CurrentAttack==Attack.Slam&&impactDone&&age>.6f)CurrentAttack=Attack.None;
        }
        void StartWave(Attack attack)
        {
            waveAttack=attack;waveStart=Time.time;waveRadius=attack==Attack.Clap?18:8;
            waveOrigin=transform.position+Vector3.up*(attack==Attack.Clap?1.5f:.45f);waveForward=transform.forward;waveHit.Clear();
            HulkWave.Create(waveOrigin,waveForward,waveRadius,attack==Attack.Clap);
        }
        void AdvanceWave()
        {
            float age=Time.time-waveStart;
            if(age<0||age>1.05f)return;
            HitTargets(waveOrigin,waveForward,Mathf.Min(waveRadius,age*waveRadius/.8f),waveAttack==Attack.Clap?65:180,
                waveAttack==Attack.Clap?110:200,waveHit,waveAttack==Attack.Clap?4:5);
        }
        void HitTargets(Vector3 origin,Vector3 forward,float range,float degrees,float damage,HashSet<EnemySoldier> hit,float height)
        {
            if(Game.Assault==null)return;
            foreach(var enemy in Game.Assault.Soldiers.ToArray())
            {
                if(enemy==null||enemy.IsDead||enemy.IsAlly||hit!=null&&hit.Contains(enemy))continue;
                Vector3 point=enemy.AimPoint,delta=point-origin,flat=Vector3.ProjectOnPlane(delta,Vector3.up);
                if(flat.magnitude>range||Mathf.Abs(delta.y)>height||Vector3.Angle(forward,flat)>degrees)continue;
                bool blocked=false;
                foreach(var wall in Physics.RaycastAll(origin,delta.normalized,delta.magnitude,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                    if(wall.collider.GetComponentInParent<EnemySoldier>()==null){blocked=true;break;}
                if(blocked)continue;
                hit?.Add(enemy);DamageEvents++;
                bool killed=enemy.TakeHit(damage,false,delta.normalized);
                Game.OnEnemyHit(enemy,false,delta.magnitude,killed,false);
                Effects.Dust(point,-delta.normalized,.45f);
            }
        }
        void LateUpdate()
        {
            if(!Active)return;
            float growth=Transforming?Mathf.SmoothStep(0,1,TransformationProgress):1;
            Vector3 focus=transform.position+Vector3.up*Mathf.Lerp(1.6f,2.45f,growth);
            Quaternion rotation=Quaternion.Euler(pitch,yaw,0);
            Vector3 offset=rotation*new Vector3(.65f,.6f,Mathf.Lerp(-3.8f,-6.3f,growth));
            float distance=offset.magnitude;
            if(Physics.SphereCast(focus,.23f,offset.normalized,out var hit,distance,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))distance=Mathf.Max(.25f,hit.distance-.12f);
            owner.Eye.position=focus+offset.normalized*distance;
            owner.Eye.rotation=Quaternion.LookRotation(focus+transform.forward*1.8f-owner.Eye.position);
            var camera=owner.Eye.GetComponent<Camera>();
            camera.fieldOfView=Mathf.Lerp(camera.fieldOfView,68+5*Mathf.InverseLerp(WalkSpeed,RunSpeed,PlanarSpeed),1-Mathf.Exp(-5*Time.deltaTime));
            // Don't fill the screen with the back of the head when a wall pushes the camera close.
            visual.SetVisible(distance>1.5f);
        }
        void LockInput(){Cursor.lockState=CursorLockMode.Locked;Cursor.visible=false;inputAfter=Time.time+.2f;}
        void BuildUi()
        {
            var go=new GameObject("Hulk abilities",typeof(Canvas),typeof(CanvasScaler),typeof(GraphicRaycaster));go.transform.SetParent(transform,false);
            canvas=go.GetComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.sortingOrder=10;
            var scaler=go.GetComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scaler.referenceResolution=new Vector2(1920,1080);
            transformButton=Button("Transform",0,"[H] 헐크 변신",()=>Toggle());
            skills.Add(Button("Punch",1,"[좌클릭] 주먹 공격",()=>{if(BeginAttack(Attack.Punch))LockInput();}));
            skills.Add(Button("Clap",2,"[우클릭] 박수 충격파",()=>{if(BeginAttack(Attack.Clap))LockInput();}));
            skills.Add(Button("Slam",3,"[Space] 점프 강타",()=>{if(BeginAttack(Attack.Slam))LockInput();}));
            skills.Add(Button("Run",4,"[Shift] 달리기",()=>{if(ToggleRun())LockInput();}));
            foreach(var b in skills)b.gameObject.SetActive(false);
        }
        Button Button(string name,int row,string label,UnityEngine.Events.UnityAction action)
            =>UiKit.TextButton(canvas.transform,name,label,22,new Color(.08f,.23f,.12f,.92f),new Color(.8f,1f,.72f),
                Vector2.one,Vector2.one,new Vector2(-28,-200-row*58),new Vector2(260,50),action);
    }
}
