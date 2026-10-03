using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.UI;

namespace SniperRidge.EditorTools
{
    /// <summary>Run only in an isolated project: -executeMethod SniperRidge.EditorTools.HulkValidation.Run</summary>
    [InitializeOnLoad]
    public static class HulkValidation
    {
        const string Key="Hulk.Validation";
        static int stage,ammo,landings,lastFrame=-1;
        static float at,peak,allyHealth,initialScale;
        static bool transformCaptured,punchCaptured;
        static int idleFootsteps;
        static Quaternion idleChest;
        static float idleChestTravel,combatKneeTravel;
        static Quaternion combatKneeStart;
        static Transform RenderedKnee()=>h.Visual.GetComponent<HulkModelRetargeter>().Character.GetBoneTransform(HumanBodyBones.LeftLowerLeg);
        static Transform RenderedChest()=>h.Visual.GetComponent<HulkModelRetargeter>().Character.GetBoneTransform(HumanBodyBones.Chest);
        static bool jumpPrepCaptured,jumpApexCaptured,jumpFallCaptured,jumpLandCaptured;
        static float takeoffHeight;
        static Quaternion restingArm;
        static Vector3 cityPosition,origin=new Vector3(1500,40.05f,1500),beforeMove;
        static GameObject fixture,ceiling;
        static EnemySoldier front,far,protectedEnemy,ally;
        static HulkController h;
        static HulkValidation(){EditorApplication.update+=Poll;}
        public static void Run()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");
            Directory.CreateDirectory("Logs");File.Delete("Logs/autoplay_result.txt");
            File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=50\ntag=hulk\nquit=1\n");
            SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Check(bool ok,string message){if(!ok)throw new Exception("Hulk regression: "+message);}
        static void Next(){stage++;at=Time.time;}
        static void Capture(string name){TankAppearanceValidation.Capture(GameManager.Instance.PlayerEye.GetComponent<Camera>(),name);}
        static void Freeze(EnemySoldier e)
        {
            e.enabled=false;if(e.Combat!=null)e.Combat.enabled=false;
            var nav=e.GetComponent<AssaultNavigation>();if(nav!=null)nav.enabled=false;
            var agent=e.GetComponent<NavMeshAgent>();if(agent!=null)agent.enabled=false;
        }
        static EnemySoldier Target(GameManager gm,int i,Vector3 point,bool friendly=false)
        {
            var e=LevelBuilder.SpawnAssaultSoldier(gm,AssaultLayout.Start,true,1500+i,EnemyRole.MachineGunner,friendly);
            gm.Assault.Soldiers.Add(e);Freeze(e);e.transform.position=point;e.transform.rotation=Quaternion.Euler(0,180,0);
            typeof(EnemySoldier).GetProperty("Health").SetValue(e,1000f);
            return e;
        }
        static GameObject Box(string name,Vector3 pos,Vector3 size)
        {var box=GameObject.CreatePrimitive(PrimitiveType.Cube);box.name=name;box.transform.SetParent(fixture.transform);box.transform.position=pos;box.transform.localScale=size;return box;}
        static void Teleport(SniperController p,Vector3 pos)
        {var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.position=pos;p.transform.rotation=Quaternion.identity;c.enabled=true;Physics.SyncTransforms();}
        static void CapturePose(string name){OliveTitanGameplayValidation.Capture(h.Visual,name,false);}
        static void CaptureSidePose(string name)
        {
            var p=GameManager.Instance.Player;var eye=p.Eye;Vector3 before=eye.position;Quaternion rotation=eye.rotation;
            eye.position=p.transform.position+new Vector3(-4.5f,2,3.7f);eye.LookAt(p.transform.position+Vector3.up*1.5f);
            CapturePose(name);eye.SetPositionAndRotation(before,rotation);
        }
        static void ValidatePunch(SniperController player)
        {
            var visual=h.Visual;var bones=visual.MotionBones;
            var hand=bones.First(b=>b.name=="LeftHand");var elbow=bones.First(b=>b.name=="LeftForearm");
            var arm=bones.First(b=>b.name=="LeftUpperArm");var chest=bones.First(b=>b.name=="Chest");
            float upperLength=Vector3.Distance(arm.position,elbow.position),lowerLength=Vector3.Distance(elbow.position,hand.position);
            var eye=player.Eye;Vector3 previousPosition=eye.position;Quaternion previousRotation=eye.rotation;
            eye.position=player.transform.TransformPoint(new Vector3(-4.5f,2.7f,4.5f));
            eye.LookAt(player.transform.position+Vector3.up*1.8f);
            visual.Pose(0,HulkController.Attack.Punch,.12f,true,false);
            Vector3 wind=visual.transform.InverseTransformPoint(hand.position);Quaternion windChest=chest.localRotation;
            CapturePose("hulk_punch_windup");
            visual.Pose(0,HulkController.Attack.Punch,HulkController.PunchImpactTime,true,false);
            Vector3 hit=visual.transform.InverseTransformPoint(hand.position);
            Check(hit.z>wind.z+.6f,"fist not driven forward at impact");
            Check(Vector3.Dot((elbow.position-arm.position).normalized,(hand.position-elbow.position).normalized)>.85f,"elbow not extended at impact");
            Check(Quaternion.Angle(windChest,chest.localRotation)>30,"torso does not rotate through punch");
            Check(Mathf.Abs(upperLength-Vector3.Distance(arm.position,elbow.position))<.001f&&Mathf.Abs(lowerLength-Vector3.Distance(elbow.position,hand.position))<.001f,"punch stretched rig bones");
            CapturePose("hulk_punch_contact");
            visual.Pose(0,HulkController.Attack.Punch,.6f,true,false);
            Check(visual.transform.InverseTransformPoint(hand.position).z<hit.z-.35f,"fist not recovered after impact");
            CapturePose("hulk_punch_recovery");
            visual.PunchLeft=true;
            visual.Pose(0,HulkController.Attack.Punch,HulkController.PunchImpactTime,true,false);
            var leftHand=bones.First(b=>b.name=="RightHand");
            Check(visual.transform.InverseTransformPoint(leftHand.position).z>.7f,"left fist not extended");
            Check(visual.transform.InverseTransformPoint(hand.position).z<.65f,"right hand not guarding on left punch");
            CapturePose("hulk_left_punch_contact");visual.PunchLeft=false;
            eye.SetPositionAndRotation(previousPosition,previousRotation);
            visual.Pose(0,HulkController.Attack.None,0,true,false);
        }
        static void MoveFixture(Vector2 direction,bool shift=false)
        {
            h.Move(direction,Time.deltaTime,shift);
            // SniperController is suspended during this fixture. Drive the normal HUD,
            // animation and sound path once, without a second physics movement step.
            h.Tick(0);
            var hips=h.Visual.MotionBones.First(b=>b.name=="Hips");
            Check(Vector3.Dot(hips.up,Vector3.up)>.85f,"locomotion lean accumulated / body toppled");
            var bones=h.Visual.MotionBones;
            float lowFoot=Mathf.Min(bones.First(b=>b.name=="LeftFoot").position.y,bones.First(b=>b.name=="RightFoot").position.y);
            Check(lowFoot>origin.y+.02f&&lowFoot<origin.y+(h.Visual.Motion=="Run"?.8f:.40f),"stance foot is floating or penetrating flat ground: "+(lowFoot-origin.y));
        }
        static void RunButton()
        {h.GetComponentsInChildren<Button>().First(b=>b.name=="Run").onClick.Invoke();}
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            if(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)>180){SessionState.SetBool(Key,false);EditorApplication.Exit(2);return;}
            try
            {
                var gm=GameManager.Instance;
                if(EditorApplication.isPlaying&&gm!=null&&gm.IsPlaying&&gm.Assault!=null)
                {
                    if(lastFrame==Time.frameCount)return;lastFrame=Time.frameCount;
                    var p=gm.Player;
                    float age=Time.time-at;
                    if(stage==0&&p.State==SniperController.WeaponState.Ready)
                    {
                        h=p.Hulk;Check(h!=null,"missing city transformation");ammo=p.AmmoInMag;cityPosition=p.transform.position;
                        foreach(var e in gm.Assault.Soldiers)Freeze(e);gm.Assault.enabled=false;gm.Health.Max=10000;gm.Health.Configure(999,0);
                        gm.Health.SetHulkForm(true);Check(gm.Health.Max==20000&&gm.Health.Current==20000,"full health not doubled");
                        gm.Health.SetHulkForm(true);Check(gm.Health.Max==20000,"health multiplier stacked");
                        gm.Health.SetHulkForm(false);gm.Health.TakeDamage(5000);
                        Check(gm.Health.Current==5000,"health fixture damage failed");
                        var button=h.GetComponentsInChildren<Button>().First(b=>b.name=="Transform");button.onClick.Invoke();
                        Check(h.Active,"transformation button did not activate");
                        Check(gm.Health.Max==20000&&gm.Health.Current==10000,"injured transformation must preserve fraction and double health");
                        Check(h.Transforming && h.Audio.Ready,"transformation / audio assets missing");
                        Check(h.Visual.UsesReferenceAsset,"supplied skinned model was not loaded");
                        Check(h.Visual.UsesBlenderMotion,"Blender corrected clips were not loaded");
                        Check(h.Visual.MotionBones.Length==43,"reference skeleton mismatch");
                        var armBones=h.Visual.MotionBones;
                        Check(Mathf.Abs(armBones.First(b=>b.name=="RightForearm").localPosition.magnitude-new Vector3(.216f,-.468f,0).magnitude*.84f)<.002f,"upper arm not shortened");
                        Check(Mathf.Abs(armBones.First(b=>b.name=="RightHand").localPosition.magnitude-new Vector3(.104f,-.563f,.021f).magnitude*.84f)<.002f,"forearm not shortened");
                        initialScale=h.Visual.transform.localScale.x;Next();
                    }
                    else if(stage==1&&age<1.7f)
                    {
                        Check(!h.ToggleRun(),"run allowed during transformation");
                        Check(!h.BeginAttack(HulkController.Attack.Punch)&&!h.Toggle(),"transformation can be interrupted by attack/toggle");
                        Vector3 before=p.transform.position;h.Move(Vector2.up,Time.deltaTime);
                        Check(Vector2.Distance(new Vector2(before.x,before.z),new Vector2(p.transform.position.x,p.transform.position.z))<.001f,"moving during transformation");
                        if(age>.5f&&!transformCaptured){Capture("hulk_reference_transform");transformCaptured=true;initialScale=h.Visual.transform.localScale.x;}
                    }
                    else if(stage==1&&age>1.95f)
                    {
                        var skins=h.Visual.GetComponentsInChildren<SkinnedMeshRenderer>();
                        var lods=h.Visual.GetComponent<HulkModelRetargeter>().Character.GetComponent<LODGroup>().GetLODs();
                        Check(lods.Select(l=>l.renderers.Cast<SkinnedMeshRenderer>().Sum(r=>r.sharedMesh.triangles.Length/3)).SequenceEqual(new[]{79762,40000,15000}),"Olive Titan LOD triangle counts changed");
                        restingArm=h.Visual.MotionBones.First(b=>b.name=="LeftUpperArm").localRotation;
                        Check(!h.Transforming && h.Visual.transform.localScale.x>initialScale+.1f,"transformation did not grow/finish");
                        Check(h.Audio.Count(HulkAudio.Cue.Transform)==1,"transform sound duplicate/missing");
                        Check(Vector3.Dot(p.Eye.position-p.transform.position,p.transform.forward)<-2,"camera not behind body");
                        Check(Vector3.Distance(p.AimPoint,p.transform.position)<3,"AI target follows chase camera");
                        p.GetDamageCapsule(out var bottom,out var top);Check(Mathf.Abs(top.y-p.transform.position.y-(HulkController.Height-HulkController.Radius))<.1f,"damage capsule not Hulk-sized");
                        Check(!p.CanSwitchWeapon&&!p.Grenades.enabled,"weapons still enabled");
                        float hp=gm.Health.Current;gm.Health.TakeDamage(10);Check(Mathf.Abs(hp-gm.Health.Current-3.5f)<.01f,"damage resistance wrong");Capture("hulk_city_rear");ValidatePunch(p);
                        fixture=new GameObject("Hulk validation arena");Box("Ground",origin+Vector3.down*.55f,new Vector3(100,1,100));Teleport(p,origin);
                        front=Target(gm,1,origin+new Vector3(0,0,2.9f));far=Target(gm,2,origin+new Vector3(0,0,11));
                        protectedEnemy=Target(gm,3,origin+new Vector3(0,0,-3));ally=Target(gm,4,origin+new Vector3(-1.5f,0,2.8f),true);allyHealth=ally.Health;
                        Physics.SyncTransforms();Next();
                    }
                    else if(stage==2&&age>.3f)
                    {Check(h.BeginAttack(HulkController.Attack.Punch),"punch rejected");Check(!h.PunchLeft,"first punch not right handed");Next();}
                    else if(stage==3&&age>.34f&&age<.7f&&!punchCaptured)
                    {
                        Check(!h.BeginAttack(HulkController.Attack.Punch)&&!h.PunchLeft,"rejected punch advanced hand sequence");
                        Check(h.Visual.Motion=="Punch","pack punch animation not playing");
                        var arm=h.Visual.MotionBones.First(b=>b.name=="LeftUpperArm");
                        Check(Quaternion.Angle(restingArm,arm.localRotation)>35,"reference rig did not deform for punch");Capture("hulk_reference_punch");punchCaptured=true;
                    }
                    else if(stage==3&&age>.85f)
                    {
                        Check(h.Audio.Count(HulkAudio.Cue.PunchSwing)==1&&h.Audio.Count(HulkAudio.Cue.PunchHit)==1,"punch audio events wrong");
                        Check(Mathf.Abs(front.Health-855)<.1f,"punch missed or repeated: "+front.Health);
                        Check(far.Health==1000&&protectedEnemy.Health==1000&&ally.Health==allyHealth,"punch hit distant/back/ally");
                        protectedEnemy.transform.position=origin+new Vector3(5,0,8);
                        Box("Solid blast cover",origin+new Vector3(3.1f,2.2f,5),new Vector3(3,5,1));Physics.SyncTransforms();
                        Check(h.BeginAttack(HulkController.Attack.Clap),"clap rejected");Next();
                    }
                    else if(stage==4&&age>.64f)
                    {
                        Check(h.Audio.Count(HulkAudio.Cue.Clap)==1,"clap audio missing/duplicate");
                        Check(far.Health==1000,"wave hit distant enemy before reaching it");Capture("hulk_clap");Next();
                    }
                    else if(stage==5&&age>1.2f)
                    {
                        Check(Mathf.Abs(front.Health-745)<.1f&&Mathf.Abs(far.Health-890)<.1f,"wave missing / duplicate damage: "+front.Health+" / "+far.Health);
                        Check(protectedEnemy.Health==1000&&ally.Health==allyHealth,"wave crossed cover or damaged ally");
                        Check(!h.BeginAttack(HulkController.Attack.Clap),"clap cooldown bypass");
                        landings=h.Landings;takeoffHeight=p.transform.position.y;Check(h.BeginAttack(HulkController.Attack.Slam),"jump rejected");Next();
                    }
                    else if(stage==6)
                    {
                        peak=Mathf.Max(peak,p.transform.position.y-origin.y);
                        if(age>.15f&&age<HulkController.JumpWindup&&!jumpPrepCaptured)
                        {
                            Check(!h.JumpLaunched&&Mathf.Abs(p.transform.position.y-takeoffHeight)<.05f,"jump launched before knee wind-up");
                            Check(h.Audio.Count(HulkAudio.Cue.Jump)==0,"takeoff sound played before takeoff");
                            CaptureSidePose("hulk_jump_prepare");jumpPrepCaptured=true;
                        }
                        if(h.JumpLaunched&&Mathf.Abs(h.JumpVelocity)<2&&!jumpApexCaptured)
                        {
                            var knee=h.Visual.MotionBones.First(b=>b.name=="LeftCalf");
                            Check(Quaternion.Angle(knee.localRotation,Quaternion.identity)>70,"knees not tucked at apex");
                            CaptureSidePose("hulk_jump_apex");jumpApexCaptured=true;
                        }
                        if(h.JumpLaunched&&h.JumpVelocity<-8&&!jumpFallCaptured)
                        {
                            var knee=h.Visual.MotionBones.First(b=>b.name=="LeftCalf");
                            Check(Quaternion.Angle(knee.localRotation,Quaternion.identity)<60,"legs not extended for landing");
                            CaptureSidePose("hulk_jump_descend");jumpFallCaptured=true;
                        }
                        if(h.Landings>landings){Next();}
                        else Check(age<3,"jump did not land");
                    }
                    else if(stage==7&&age>.1f&&age<.45f&&!jumpLandCaptured)
                    {
                        var knee=h.Visual.MotionBones.First(b=>b.name=="LeftCalf");
                        Check(Quaternion.Angle(knee.localRotation,Quaternion.identity)>25,"landing failed to absorb impact with knees");
                        CaptureSidePose("hulk_slam");jumpLandCaptured=true;
                    }
                    else if(stage==7&&age>1.3f)
                    {
                        Check(h.Audio.Count(HulkAudio.Cue.Jump)==1&&h.Audio.Count(HulkAudio.Cue.Slam)==1,"jump/landing sound not distinct single events");
                        Check(jumpPrepCaptured&&jumpApexCaptured&&jumpFallCaptured&&jumpLandCaptured,"missing jump phase");
                        Check(peak>2,"jump too low");Check(h.Landings==landings+1,"slam repeated");
                        Check(Mathf.Abs(front.Health-545)<.1f,"slam damage wrong: "+front.Health);
                        Check(far.Health==890&&ally.Health==allyHealth,"slam range / friendly fire");
                        Check(!h.BeginAttack(HulkController.Attack.Slam),"slam cooldown bypass");
                        beforeMove=p.transform.position;p.enabled=false;Next();
                    }
                    else if(stage==8)
                    {
                        MoveFixture(Vector2.left);
                        if(age<.06f)Check(h.PlanarSpeed<3,"movement snapped immediately to full speed");
                        if(age>1f)
                        {
                            Check(Vector3.Distance(p.transform.position,beforeMove)>2.0f,"walking failed");
                            Check(Mathf.Abs(h.PlanarSpeed-HulkController.WalkSpeed)<.2f&&h.Visual.Motion==(h.Visual.UsesFullBodyRun?"Run":"Walk"),"normal movement speed or animation wrong");
                            Capture("hulk_walk");RunButton();Check(h.RunEnabled,"run UI button failed");stage=81;at=Time.time;
                        }
                    }
                    else if(stage==81)
                    {
                        MoveFixture(Vector2.left);
                        if(age>1f)
                        {
                            Check(h.Sprinting&&h.PlanarSpeed>HulkController.RunSpeed-.2f&&h.Visual.Motion=="Run","sprint speed/animation not active");
                            Check(Mathf.Abs(Mathf.DeltaAngle(0,h.Visual.transform.localEulerAngles.y))>45,"strafe body did not turn into travel direction");
                            Check(h.Audio.Count(HulkAudio.Cue.Footstep)>2,"gait footsteps missing");Capture("hulk_run");
                            beforeMove=p.transform.position;stage=82;at=Time.time;
                        }
                    }
                    else if(stage==82)
                    {
                        MoveFixture(Vector2.right);
                        if(age<.08f)Check(p.transform.position.x<=beforeMove.x+.05f,"direction reversed instantly without braking");
                        if(age>1.1f)
                        {
                            Check(h.PlanarSpeed>HulkController.RunSpeed-.5f,"failed to accelerate after reversing");Capture("hulk_run_turn");
                            Box("Sprint collision wall",p.transform.position+new Vector3(3,2,0),new Vector3(.5f,5,10));Physics.SyncTransforms();stage=83;at=Time.time;
                        }
                    }
                    else if(stage==83)
                    {
                        MoveFixture(Vector2.right);
                        if(age>.8f)
                        {
                            Check(h.PlanarSpeed<.3f,"sprint crossed wall or retained blocked velocity");
                            RunButton();Check(!h.RunEnabled,"run UI button did not turn off");stage=84;at=Time.time;
                        }
                    }
                    else if(stage==84)
                    {
                        MoveFixture(Vector2.zero);
                        if(age>.8f)
                        {
                            Check(h.PlanarSpeed<.05f&&!h.Sprinting&&h.Visual.Motion=="Idle","idle not restored after stopping");
                            idleFootsteps=h.Visual.FootstepSerial;
                            idleChest=RenderedChest().localRotation;idleChestTravel=0;
                            stage=85;at=Time.time;
                        }
                    }
                    else if(stage==85)
                    {
                        MoveFixture(Vector2.zero);
                        idleChestTravel=Mathf.Max(idleChestTravel,Quaternion.Angle(idleChest,RenderedChest().localRotation));
                        if(age>1.3f)
                        {
                            Check(idleChestTravel>.1f,"rendered idle body frozen without breathing: "+idleChestTravel);
                            Check(idleFootsteps==h.Visual.FootstepSerial,"footsteps continued at rest");Capture("hulk_idle_breathing");stage=86;at=Time.time;
                        }
                    }
                    else if(stage==86)
                    {
                        MoveFixture(Vector2.left,true);
                        if(age>.8f)
                        {
                            Check(h.Sprinting&&!h.RunEnabled&&h.PlanarSpeed>HulkController.RunSpeed-.5f,"held Shift sprint path failed");
                            Check(p.AmmoInMag==ammo,"Hulk used bullets");
                            beforeMove=p.transform.position;combatKneeStart=RenderedKnee().localRotation;combatKneeTravel=0;
                            Check(h.BeginAttack(HulkController.Attack.Punch),"miss punch rejected");Check(h.PunchLeft,"second punch not left handed");stage=80;at=Time.time;
                        }
                    }
                    else if(stage==80)
                    {
                        MoveFixture(Vector2.up);
                        combatKneeTravel=Mathf.Max(combatKneeTravel,Quaternion.Angle(combatKneeStart,RenderedKnee().localRotation));
                        if(age<=.85f)return;
                        Check(Vector3.Distance(p.transform.position,beforeMove)>1.0f,"moving punch stopped player");
                        Check(combatKneeTravel>12,"rendered legs frozen during moving punch");
                        Capture("hulk_moving_punch");
                        Check(h.Audio.Count(HulkAudio.Cue.PunchSwing)==2&&h.Audio.Count(HulkAudio.Cue.PunchHit)==1,"miss punch incorrectly played body impact");
                        Check(h.BeginAttack(HulkController.Attack.Punch)&&!h.PunchLeft,"third punch did not return to right hand");stage=87;at=Time.time;
                    }
                    else if(stage==87)
                    {
                        MoveFixture(Vector2.left);
                        if(age<=.85f)return;
                        p.enabled=true;
                        Check(h.Audio.Count(HulkAudio.Cue.PunchSwing)==3,"third swing missing");
                        float healthBefore=gm.Health.Current;
                        Check(h.Toggle(),"human restore rejected");
                        Check(gm.Health.Max==10000&&Mathf.Abs(gm.Health.Current-healthBefore*.5f)<.01f,"human health not restored proportionally");stage=9;at=Time.time;
                    }
                    else if(stage==9&&age>.2f)
                    {
                        Check(!h.RunEnabled&&!h.Sprinting&&!h.ToggleRun(),"sprint state leaked into human form");
                        Check(!p.IsHulk&&p.Grenades.enabled&&p.CanSwitchWeapon,"FPS controls not restored");
                        Check(Vector3.Distance(p.Eye.localPosition,Vector3.up*1.68f)<.05f,"FPS eye not restored");
                        Check(Mathf.Abs(p.GetComponent<CharacterController>().height-FpsMovement.StandingHeight)<.01f,"human capsule not restored");
                        ceiling=Box("Low ceiling",p.transform.position+Vector3.up*(HulkController.Height-.15f),new Vector3(5,.3f,5));Physics.SyncTransforms();
                        float hpBefore=gm.Health.Current;
                        Check(!h.Toggle()&&!h.Active,"transformed through low ceiling");
                        Check(gm.Health.Max==10000&&gm.Health.Current==hpBefore,"failed transformation changed health");ceiling.SetActive(false);UnityEngine.Object.Destroy(ceiling);
                        Check(h.Toggle(),"second transformation failed");
                        Check(gm.Health.Max==20000&&Mathf.Abs(gm.Health.Current-hpBefore*2)<.01f,"repeat transformation healed or stacked max health");Next();
                    }
                    else if(stage==10&&age>1.95f)
                    {
                        Box("Camera wall",p.transform.position+new Vector3(0,2,-2.8f),new Vector3(8,5,.4f));Physics.SyncTransforms();Next();
                    }
                    else if(stage==11&&age>.2f)
                    {
                        Check(p.Eye.position.z>p.transform.position.z-2.6f,"camera passed through wall");
                        Check(h.Toggle(),"final restore failed");fixture.SetActive(false);UnityEngine.Object.Destroy(fixture);Teleport(p,cityPosition);
                        foreach(var target in new[]{front,far,protectedEnemy,ally}){gm.Assault.Soldiers.Remove(target);UnityEngine.Object.Destroy(target.gameObject);}
                        foreach(var e in gm.Assault.Soldiers)
                        {
                            e.enabled=true;if(e.Combat!=null)e.Combat.enabled=true;
                            var agent=e.GetComponent<NavMeshAgent>();if(agent!=null)agent.enabled=true;
                            var navigation=e.GetComponent<AssaultNavigation>();if(navigation!=null)navigation.enabled=true;
                        }
                        gm.Assault.enabled=true;gm.Health.Configure(0,10000);
                        Debug.Log("[Hulk validation] PASS: right-left-right punches / shorter arms / planted gait feet / crouch-takeoff-tuck-extension-landing, run button / Shift sprint / smooth acceleration and reversal / collision / gait blend / idle breathing / phase footsteps, double health / proportional restore / no toggle healing, punch wind-up / torso twist / extension / recovery / fixed bone lengths, Blender-corrected skinned mesh and authored clips, 43-bone motion driver, transformation growth/lockout/audio, attack-specific audio, button, rear camera, physical movement, punch cone, wave travel/cover/ally protection, cooldowns, jump height="+peak.ToString("0.00")+", one landing, ammo preserved, FPS restore, headroom, camera collision.");
                        Check(h.Toggle(),"city return failed");Next();
                    }
                    else if(stage==12&&age>2f){Capture("hulk_city_final");stage=13;}
                }
                if(!File.Exists("Logs/autoplay_result.txt")||EditorApplication.isPlayingOrWillChangePlaymode)return;
                string result=File.ReadAllText("Logs/autoplay_result.txt");Debug.Log("HULK_RUNTIME_RESULT\n"+result);
                SessionState.SetBool(Key,false);EditorApplication.Exit(stage==13&&result.Contains("errors=0")&&result.Contains("status=완료")?0:3);
            }
            catch(Exception ex){Debug.LogException(ex);SessionState.SetBool(Key,false);EditorApplication.Exit(4);}
        }
    }
}
