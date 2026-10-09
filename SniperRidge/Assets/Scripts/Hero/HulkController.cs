using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace SniperRidge
{
    /// <summary>City-only transformation. The player, health and mission remain the same objects.</summary>
    public sealed class HulkController : MonoBehaviour
    {
        public enum Attack { None, Punch, Clap, Slam, Kick, BarrelThrow, Uproot, PoleSwing }
        public bool Active { get; private set; }
        public const float TransformDuration=2.833333f;
        public const float WalkSpeed=5.2f, RunSpeed=8.4f;
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
        // Source contact stays at 1.40s; playback and gameplay share the same rate.
        public const float PunchPlaybackRate=4.5f;
        public const float PunchDuration=3.833333f/PunchPlaybackRate, PunchImpactTime=1.40f/PunchPlaybackRate;
        public const float JumpWindup=.28f, JumpLaunchSpeed=13.8f, JumpGravity=36f, JumpRecovery=.28f, JumpCooldown=2f;
        public const float ClapDuration=1f, ClapImpactTime=.43f;
        bool HasClap => visual!=null && visual.Definition && visual.Definition.Clap;
        public const float KickDuration=1.5f, KickImpactTime=.65f;
        public bool PunchLeft { get; private set; }
        bool slamLaunched;
        float slamTakeoffY;
        public bool VehicleJump { get; private set; }
        public const float DropLaunchSpeed=8.4f, DropRecovery=.6f;
        public float SlamRecovery => VehicleJump?DropRecovery:JumpRecovery;
        public float LastSlamPower { get; private set; }=1;
        public float LastSlamRadius { get; private set; }=8;
        public float LastSlamDamage { get; private set; }=200;
        public static float SlamPowerForDrop(float drop)=>1+Mathf.Clamp(drop,0,3)*.5f;
        bool FourActionsOnly => visual!=null && visual.Definition && visual.Definition.FourActionsOnly;
        public float JumpVelocity => vertical;
        public bool JumpLaunched => slamLaunched;
        public bool Transforming => Active && Time.time<transformedAt+TransformDuration;
        public float TransformationProgress => Mathf.Clamp01((Time.time-transformedAt)/TransformDuration);
        public HulkAudio Audio { get; private set; }
        public HulkVisual Visual => visual;
        public HeroStreetInteraction Street { get; private set; }
        float transformedAt=-99, lastIncoming=-99, guardUntil=-99;
        int incomingBurst;
        public bool Blocking => Active&&!Transforming&&CurrentAttack==Attack.None&&Grounded&&Time.time<guardUntil;
        bool swingPlayed;
        public Attack CurrentAttack { get; private set; }
        public float AttackAge => Time.time-actionAt;
        public float ClapCooldown => Mathf.Max(0,clapAt-Time.time);
        public float SlamCooldown => Mathf.Max(0,slamAt-Time.time);
        public float KickCooldown => Mathf.Max(0,kickAt-Time.time);
        public const float Height=2.76f, Radius=.78f;
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
        float yaw,pitch=15,vertical,actionAt,punchAt,clapAt,slamAt,kickAt,waveStart=-99,waveRadius,waveDamage,inputAfter;
        bool impactDone,airborne;
        Vector3 waveOrigin,waveForward;
        Attack waveAttack;int waveSerial;

        GameManager Game => GameManager.Instance;
        public static HulkController Attach(SniperController player)
        {
            var h=player.gameObject.AddComponent<HulkController>();h.owner=player;
            h.Street=player.gameObject.AddComponent<HeroStreetInteraction>();h.Street.Initialize(h);
            h.capsule=player.GetComponent<CharacterController>();h.Audio=player.gameObject.AddComponent<HulkAudio>();h.BuildUi();return h;
        }
        public bool Toggle()
        {
            if(Active&&Game&&Game.Armor)return false;
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
            incomingBurst=0;lastIncoming=guardUntil=-99;
            if(Active)Street.Drop();
            Active=!Active;Game.Health.SetHulkForm(Active);RunEnabled=false;Sprinting=false;horizontalVelocity=actualVelocity=Vector3.zero;PlanarSpeed=0;vertical=-2;waveStart=-99;waveHit.Clear();
            if(Active)
            {
                PunchLeft=false;
                visual.ResetLocomotion();lastFootstep=visual.FootstepSerial;
                transformedAt=Time.time;Audio.Play(HulkAudio.Cue.Transform);
                visual.gameObject.SetActive(true);visual.Pose(0,Attack.None,0,Grounded,false,0);yaw=transform.eulerAngles.y;pitch=15;
                capsule.height=Height;capsule.radius=Radius;capsule.center=Vector3.up*Height*.5f;capsule.stepOffset=.45f;
            }
            else {Audio.Stop();visual.gameObject.SetActive(false);FpsMovement.Configure(capsule);owner.FreeMovement.ResetPose();}
            owner.SetHulkView(Active);LockInput();
            Effects.Puff(transform.position+Vector3.up*.2f,Vector3.up,1.5f,new Color(.48f,.52f,.35f),.7f);
            Game.Hud.Announce(Active?(Game.Armor?"분노의 반격 · 적 전차와 공격 헬기를 격파하세요":"헐크 변신 · 왕을 향해 돌파하세요"):"FPS 모드로 복귀");
            return true;
        }
        public void CancelForExternal()
        {
            CurrentAttack=Attack.None;horizontalVelocity=actualVelocity=Vector3.zero;vertical=-2;PlanarSpeed=0;
            guardUntil=-99;waveStart=-99;yaw=transform.eulerAngles.y;
        }
        public void NotifyHit()
        {
            if(!Active)return;
            incomingBurst=Time.time-lastIncoming<1.2f?incomingBurst+1:1;lastIncoming=Time.time;
            if(incomingBurst>=3)guardUntil=Time.time+1.3f;
            if(!Transforming&&CurrentAttack==Attack.None&&Grounded&&!Blocking)visual.ReactToHit();
        }
        public int AttackSerial { get; private set; }
        public bool BeginAttack(Attack attack)
        {
            if(Game&&Game.Armor&&Game.Armor.Rampage&&Game.Armor.Rampage.Busy)return false;
            if(attack==Attack.Punch&&Game&&Game.Armor&&Game.Armor.Rampage&&Game.Armor.Rampage.Held)return Game.Armor.Rampage.SwingHeld();
            if(attack==Attack.Punch&&Street&&Street.Held)attack=Street.Held.Throwable?Attack.BarrelThrow:Attack.PoleSwing;
            if(HeroStreetInteraction.IsPropAttack(attack)&&(!visual||!visual.Definition.PropClip(attack)||!Street.CanAttack(attack)))return false;
            if(!Active || Transforming || Game==null || !Game.IsPlaying || CurrentAttack!=Attack.None || !Grounded)return false;
            if(attack==Attack.Clap&&!HasClap||FourActionsOnly&&attack==Attack.Kick)return false;
            if(attack==Attack.None || attack==Attack.Punch&&Time.time<punchAt || attack==Attack.Clap&&Time.time<clapAt || attack==Attack.Slam&&Time.time<slamAt || attack==Attack.Kick&&Time.time<kickAt)return false;
            guardUntil=-99;incomingBurst=0;
            AttackSerial++;CurrentAttack=attack;actionAt=Time.time;impactDone=false;swingPlayed=false;
            if(attack==Attack.Punch)
            {PunchLeft=false;visual.PunchLeft=false;punchAt=Time.time+PunchDuration;}
            if(attack==Attack.Clap)clapAt=Time.time+4f;
            if(attack==Attack.Kick)kickAt=Time.time+2.2f;
            if(attack==Attack.Slam){slamAt=Time.time+JumpCooldown;slamLaunched=false;airborne=false;
                VehicleJump=visual.Definition.JumpDown&&Physics.Raycast(transform.position+Vector3.up*.2f,Vector3.down,out var support,.6f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)&&support.collider.GetComponentInParent<DestructibleVehicle>();
            }
            return true;
        }
        public void Tick(float dt)
        {
            bool playing=Game!=null && Game.IsPlaying;
            canvas.gameObject.SetActive(playing);
            if(!playing){Audio.Stop();RunEnabled=false;Sprinting=false;horizontalVelocity=Vector3.zero;return;}
            var rampage=Game.Armor?Game.Armor.Rampage:null;
            if(rampage && rampage.Busy){if(Active&&visual)rampage.PoseHero();return;}
            if(Input.GetKeyDown(KeyCode.H)&&!rampage)Toggle();
            if(Street)Street.RefreshUi();
            transformButton.interactable=!Transforming && CurrentAttack==Attack.None;
            transformButton.GetComponentInChildren<Text>().text=Transforming?"변신 중…":Active?"[H] 인간으로 복귀":"[H] 헐크 변신";
            for(int i=0;i<skills.Count;i++)skills[i].gameObject.SetActive(Active&&(i!=1||HasClap)&&(!FourActionsOnly||i!=4));
            if(!Active)return;
            skills[0].interactable=!Transforming&&CurrentAttack==Attack.None&&Grounded;
            skills[1].interactable=!Transforming&&CurrentAttack==Attack.None&&Grounded&&ClapCooldown<=0;
            skills[3].interactable=!Transforming&&CurrentAttack==Attack.None;
            skills[3].GetComponentInChildren<Text>().text=RunEnabled?"[Shift] 빠른 달리기 켜짐":"[Shift] 빠른 달리기";
            skills[2].interactable=!Transforming&&CurrentAttack==Attack.None&&Grounded&&SlamCooldown<=0;
            skills[1].GetComponentInChildren<Text>().text=ClapCooldown>0?"박수 충격파 "+ClapCooldown.ToString("0.0")+"초":"[우클릭] 박수 충격파";
            skills[2].GetComponentInChildren<Text>().text=SlamCooldown>0?"점프 강타 "+SlamCooldown.ToString("0.0")+"초":"[Space] 점프 강타";
            skills[4].interactable=!Transforming&&CurrentAttack==Attack.None&&Grounded&&KickCooldown<=0;
            skills[4].GetComponentInChildren<Text>().text=KickCooldown>0?"날아차기 "+KickCooldown.ToString("0.0")+"초":"[F] 날아차기";
            if(Input.GetKeyDown(KeyCode.Escape)){Cursor.lockState=CursorLockMode.None;Cursor.visible=true;}
            bool keys=Cursor.lockState==CursorLockMode.Locked&&Time.time>=inputAfter&&!Transforming;
            if(!keys&&Input.GetMouseButtonDown(0)&&(EventSystem.current==null||!EventSystem.current.IsPointerOverGameObject()))LockInput();
            if(keys)
            {
                yaw+=Input.GetAxis("Mouse X")*owner.MouseSensitivity;
                pitch=Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*owner.MouseSensitivity,rampage?-55:-12,55);
                if(Input.GetMouseButton(0))BeginAttack(Attack.Punch);
                if(Input.GetMouseButtonDown(1))BeginAttack(Attack.Clap);
                if(Input.GetKeyDown(KeyCode.Space))BeginAttack(Attack.Slam);
                if(rampage)
                {
                    if(Input.GetKeyDown(KeyCode.E))rampage.Interact();
                    if(Input.GetKeyDown(KeyCode.R))rampage.RestrainNearest();
                    if(Input.GetKeyDown(KeyCode.Q))rampage.DropHeld();
                    if(Input.GetKeyDown(KeyCode.F))BeginAttack(Attack.Kick);
                    if(rampage.Busy)return;
                }
                else
                {
                    if(Input.GetKeyDown(KeyCode.F))BeginAttack(Attack.Kick);
                    if(Input.GetKeyDown(KeyCode.E))Street.Interact();
                    if(Input.GetKeyDown(KeyCode.Q))Street.Drop();
                }
            }
            Vector2 movement=keys?new Vector2((Input.GetKey(KeyCode.D)?1:0)-(Input.GetKey(KeyCode.A)?1:0),
                (Input.GetKey(KeyCode.W)?1:0)-(Input.GetKey(KeyCode.S)?1:0)):Vector2.zero;
            Move(movement,dt,keys&&(Input.GetKey(KeyCode.LeftShift)||Input.GetKey(KeyCode.RightShift)));
            AdvanceAttack();AdvanceWave();
            float speed=PlanarSpeed;
            visual.SetMotion(transform.InverseTransformDirection(actualVelocity),turnRate,acceleration);
            visual.SetJumpMotion(vertical,slamLaunched,VehicleJump);visual.SetBlocking(Blocking);
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
                Vector2 launchInput=input;input=Vector2.zero;horizontalVelocity=Vector3.zero;
                if(AttackAge>=JumpWindup&&Grounded){slamTakeoffY=transform.position.y;vertical=VehicleJump?DropLaunchSpeed:JumpLaunchSpeed;slamLaunched=true;Audio.Play(HulkAudio.Cue.Jump);
                    if(VehicleJump){input=launchInput;horizontalVelocity=Quaternion.Euler(0,yaw,0)*new Vector3(input.x,0,input.y)*RunSpeed;}
                }
            }
            if(Grounded&&vertical<0)vertical=-2;
            vertical=Mathf.Max(-30,vertical-JumpGravity*dt);
            Sprinting=!Transforming&&CurrentAttack==Attack.None&&(RunEnabled||sprint)&&input.sqrMagnitude>.01f;
            float speed=CurrentAttack==Attack.Uproot?0:HeroStreetInteraction.IsPropAttack(CurrentAttack)?1.8f:CurrentAttack==Attack.Clap?2f:CurrentAttack==Attack.Punch?3.8f:CurrentAttack==Attack.Kick?1.4f:CurrentAttack==Attack.Slam&&VehicleJump&&slamLaunched&&!impactDone?RunSpeed:Sprinting?RunSpeed:WalkSpeed;
            Vector3 desired=Quaternion.Euler(0,yaw,0)*new Vector3(input.x,0,input.y)*speed;
            float rate=desired.sqrMagnitude<horizontalVelocity.sqrMagnitude?44:32;
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
                {impactDone=true;Landings++;
                    LastSlamPower=SlamPowerForDrop(slamTakeoffY-transform.position.y);
                    StartWave(Attack.Slam);actionAt=Time.time;Audio.Play(HulkAudio.Cue.Slam);
                    if(LastSlamPower>1.1f)Game.Hud.ShowShotFeedback("고공 강타 · 피해 "+LastSlamPower.ToString("0.0")+"배");}
                // A low ceiling may prevent take-off. Never leave the attack locked forever.
                if(!airborne&&AttackAge>JumpWindup+.8f){CurrentAttack=Attack.None;}
            }
        }
        void AdvanceAttack()
        {
            float age=AttackAge;
            if(HeroStreetInteraction.IsPropAttack(CurrentAttack))
            {
                var clip=visual.Definition.PropClip(CurrentAttack);float duration=clip.length/HeroStreetInteraction.PlaybackRate;
                if(!impactDone&&age>=duration*HeroStreetInteraction.EventFraction(CurrentAttack))
                {impactDone=true;Street.Impact(CurrentAttack);}
                if(age>=duration){Street.Finish(CurrentAttack);CurrentAttack=Attack.None;}
            }
            else if(CurrentAttack==Attack.Punch)
            {
                if(!swingPlayed&&age>=PunchImpactTime-.13f){swingPlayed=true;Audio.Play(HulkAudio.Cue.PunchSwing,.8f);}
                if(!impactDone&&age>=PunchImpactTime)
                {
                    int before=DamageEvents;
                    impactDone=true;HitTargets(transform.position+Vector3.up*1.6f,transform.forward,3.8f,60,145,null,2.8f);
                    bool carHit=DestructibleVehicle.PunchNearest(transform.position+Vector3.up*1.15f,transform.forward,3.8f);
                    Effects.Puff(transform.TransformPoint(PunchLeft?.5f:-.5f,1.9f,1.3f),transform.forward,.35f,new Color(.7f,.75f,.55f),.2f);if(DamageEvents>before||carHit)Audio.Play(HulkAudio.Cue.PunchHit);
                }
                if(age>PunchDuration)CurrentAttack=Attack.None;
            }
            else if(CurrentAttack==Attack.Clap)
            {
                if(!impactDone&&age>=ClapImpactTime){impactDone=true;StartWave(Attack.Clap);Audio.Play(HulkAudio.Cue.Clap);}
                if(age>ClapDuration)CurrentAttack=Attack.None;
            }
            else if(CurrentAttack==Attack.Kick)
            {
                if(!swingPlayed&&age>=.25f){swingPlayed=true;Audio.Play(HulkAudio.Cue.PunchSwing,1);}
                if(!impactDone&&age>=KickImpactTime)
                {
                    int before=DamageEvents;impactDone=true;
                    HitTargets(transform.position+Vector3.up*1.5f,transform.forward,3.8f,48,190,null,2.5f);
                    Effects.Puff(transform.TransformPoint(0,1.4f,1.6f),transform.forward,.45f,new Color(.7f,.75f,.55f),.25f);
                    if(DamageEvents>before)Audio.Play(HulkAudio.Cue.PunchHit,1);
                }
                if(age>KickDuration)CurrentAttack=Attack.None;
            }
            else if(CurrentAttack==Attack.Slam&&impactDone&&age>SlamRecovery)CurrentAttack=Attack.None;
        }
        void StartWave(Attack attack)
        {
            waveAttack=attack;waveSerial=AttackSerial;waveStart=Time.time;
            float power=attack==Attack.Slam?LastSlamPower:1;
            waveRadius=attack==Attack.Clap?18:8*Mathf.Sqrt(power);
            waveDamage=attack==Attack.Clap?110:200*power;
            if(attack==Attack.Slam){LastSlamRadius=waveRadius;LastSlamDamage=waveDamage;}
            waveOrigin=transform.position+Vector3.up*(attack==Attack.Clap?2.05f:.45f);waveForward=transform.forward;waveHit.Clear();
            HulkWave.Create(waveOrigin,waveForward,waveRadius,attack==Attack.Clap,power);
            if(Game.Armor&&Game.Armor.Rampage)Game.Armor.Rampage.Strike(waveOrigin,waveForward,waveRadius,attack==Attack.Clap?65:180,attack==Attack.Clap?1:2);
        }
        void AdvanceWave()
        {
            float age=Time.time-waveStart;
            if(age<0||age>1.05f)return;
            HitTargets(waveOrigin,waveForward,HulkWave.RadiusAt(age,waveRadius),waveAttack==Attack.Clap?65:180,
                waveDamage,waveHit,waveAttack==Attack.Clap?4:5,false,waveSerial);
        }
        public void HitInfantryWithProp()=>HitTargets(owner.AimPoint,transform.forward,8,95,220,new HashSet<EnemySoldier>(),5,true);
        void HitTargets(Vector3 origin,Vector3 forward,float range,float degrees,float damage,HashSet<EnemySoldier> hit,float height,bool propImpact=false,int serial=-1)
        {
            if(Game.Armor&&Game.Armor.Rampage&&hit==null)Game.Armor.Rampage.Strike(origin,forward,range,degrees,1);
            if(Game.Assault&&Game.Assault.Midboss)Game.Assault.Midboss.HeroHit(origin,forward,range,degrees,damage,serial<0?AttackSerial:serial);
            IEnumerable<EnemySoldier> targets=Game.Assault!=null?Game.Assault.Soldiers:Game.Armor?Game.Armor.Rampage.Infantry:null;
            if(targets==null)return;
            foreach(var enemy in targets.ToArray())
            {
                if(enemy==null||enemy.IsDead||enemy.IsAlly||hit!=null&&hit.Contains(enemy))continue;
                Vector3 point=enemy.AimPoint,delta=point-origin,flat=Vector3.ProjectOnPlane(delta,Vector3.up);
                if(flat.magnitude>range||Mathf.Abs(delta.y)>height||Vector3.Angle(forward,flat)>degrees)continue;
                bool blocked=false;
                foreach(var wall in Physics.RaycastAll(origin,delta.normalized,delta.magnitude,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                    if(wall.collider.GetComponentInParent<EnemySoldier>()==null){blocked=true;break;}
                if(blocked)continue;
                hit?.Add(enemy);DamageEvents++;
                bool killed=propImpact?enemy.TakePropHit(damage,delta.normalized):enemy.TakeHit(damage,false,delta.normalized,true);
                Game.OnEnemyHit(enemy,false,delta.magnitude,killed,false);
                Effects.Dust(point,-delta.normalized,.45f);
            }
        }
        void LateUpdate()
        {
            if(!Active)return;
            float growth=Transforming?Mathf.SmoothStep(0,1,TransformationProgress):1;
            Vector3 focus=transform.position+Vector3.up*Mathf.Lerp(1.6f,2.10f,growth);
            Quaternion rotation=Quaternion.Euler(pitch,yaw,0);
            Vector3 offset=rotation*new Vector3(.72f,.7f,Mathf.Lerp(-3.8f,-5.3f,growth));
            float distance=offset.magnitude;
            if(Physics.SphereCast(focus,.23f,offset.normalized,out var hit,distance,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))distance=Mathf.Max(.25f,hit.distance-.12f);
            owner.Eye.position=focus+offset.normalized*distance;
            owner.Eye.rotation=Quaternion.LookRotation(focus+(Game.Armor?rotation*Vector3.forward*70:transform.forward*1.8f)-owner.Eye.position);
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
            skills.Add(Button("Run",4,"[Shift] 빠른 달리기",()=>{if(ToggleRun())LockInput();}));
            skills.Add(Button("Kick",5,"[F] 날아차기",()=>{if(BeginAttack(Attack.Kick))LockInput();}));
            Street.SetButton(Button("Street weapon",6,"[E] 자동차 / 드럼통 / 전봇대 집기",()=>{if(Street.Interact())LockInput();}));
            foreach(var b in skills)b.gameObject.SetActive(false);
        }
        Button Button(string name,int row,string label,UnityEngine.Events.UnityAction action)
            =>UiKit.TextButton(canvas.transform,name,label,22,new Color(.08f,.23f,.12f,.92f),new Color(.8f,1f,.72f),
                Vector2.one,Vector2.one,new Vector2(-28,-200-row*58),new Vector2(260,50),action);
    }
}
