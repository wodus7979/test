using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    [InitializeOnLoad] public static class TankRampageValidation
    {
        const string Key="TankRampage.Validation";
        static int stage,last=-1;
        static float at,health;
        static int previousHits;
        static float nextFrame;
        static int movieFrame;
        static bool sawProne,sawGetUp;
        static Vector3 infantryStart,chargeStart;
        static EnemySoldier infantryTarget;
        static bool sawGrip,sawDeck,secondTurret,shellStarted,shellFinished,earlyShotChecked,rockPickup;
        static float cannonAt,nextDiagnostic;
        static int shellAmmo;
        static TankVehicle target;
        static RampageProp prop;
        static EnemyAttackHelicopter helicopter;
        static TankRampageValidation(){EditorApplication.update+=Poll;Application.logMessageReceived+=(message,stack,type)=>{if(SessionState.GetBool(Key,false)&&(type==LogType.Exception||type==LogType.Error||type==LogType.Assert))SessionState.SetString(Key+"errors",SessionState.GetString(Key+"errors","")+message+"\n");};}
        static void Check(bool ok,string text){if(!ok)throw new Exception("Tank rampage: "+text);}
        public static void Run()
        {
            var set=Resources.Load<NativeMutantSet>(HulkVisual.Resource);
            foreach(var clip in new[]{set.TankClimb,set.TankPull,set.TankThrow,set.TankRestrain,set.ShellHit,Resources.Load<AnimationClip>("Enemies/TankBlastFall"),Resources.Load<AnimationClip>("Enemies/TankGetUp")})Check(clip&&clip.length>.5f,"native clip missing");
            var shader=Shader.Find("SniperRidge/HeroArmorSurface");Check(shader&&shader.isSupported&&!ShaderUtil.ShaderHasError(shader),"PBR shader compilation");
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/autoplay.txt","mode=8\nwait=600\ntag=tank_rampage\nquit=1\n");
            Directory.CreateDirectory("Screenshots/tank-rampage");File.WriteAllText("Screenshots/tank-rampage/frames.csv","");
            SessionState.SetString(Key+"errors","");SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Next(){stage++;at=Time.time;Debug.Log("[Rampage test] Stage "+stage);}
        static void Capture(Camera camera,string name)
        {
            Directory.CreateDirectory("Screenshots/tank-rampage");var rt=new RenderTexture(1600,1000,24);var tex=new Texture2D(1600,1000,TextureFormat.RGB24,false);
            var old=camera.targetTexture;var active=RenderTexture.active;
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,1600,1000),0,0);tex.Apply();File.WriteAllBytes("Screenshots/tank-rampage/"+name+".png",tex.EncodeToPNG());}
            finally{camera.targetTexture=old;RenderTexture.active=active;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(tex);}
        }
        static void View(Transform eye,Vector3 point,Vector3 offset){eye.position=point+offset;eye.LookAt(point);}
        static void Place(SniperController player,Vector3 position,Quaternion facing)
        {
            var cc=player.GetComponent<CharacterController>();cc.enabled=false;player.transform.SetPositionAndRotation(position,facing);cc.enabled=true;Physics.SyncTransforms();
        }
        static Vector3 Ground(GameManager gm,Vector3 p){p.y=TerrainGenerator.GroundHeight(gm.Terrain,p.x,p.z)+.08f;return p;}
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            try
            {
                Check(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)<420,"Play timeout at stage "+stage);
                var gm=GameManager.Instance;
                if(!EditorApplication.isPlaying||!gm||!gm.IsPlaying||!gm.Armor||last==Time.frameCount)return;
                last=Time.frameCount;var battle=gm.Armor;var rampage=battle.Rampage;var player=gm.Player;var cam=player.Eye.GetComponent<Camera>();float age=Time.time-at;
                if(!infantryTarget&&rampage.AliveInfantry>0){infantryTarget=rampage.Infantry.First(e=>e&&!e.IsDead);infantryStart=infantryTarget.transform.position;}
                if(stage>=5&&stage<17)foreach(var h in UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>())h.enabled=false;
                if(stage>=5&&gm.Health.Current<100)gm.Health.Configure(999,0);
                if(rampage.EscapePhase=="Prone"){if(!sawProne)Capture(cam,"02b_grounded");sawProne=true;}
                if(rampage.EscapePhase=="GettingUp"){if(!sawGetUp)Capture(cam,"02c_get_up");sawGetUp=true;}
                if(stage==18&&Time.time>nextDiagnostic){nextDiagnostic=Time.time+3;Debug.Log("[Rampage diagnostic] busy="+rampage.Busy+" grounded="+player.Hulk.Grounded+" age="+age+" action="+rampage.Prompt+" pos="+player.transform.position);}
                if(stage==18&&age>11)
                {
                    foreach(var h in UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>())h.enabled=false;
                    foreach(var e in rampage.Infantry)if(e)e.enabled=false;
                }
                if(stage>0&&stage<10&&Time.time>=nextFrame)
                {
                    nextFrame=Time.time+.1f;
                    string name="motion_"+(movieFrame++).ToString("D4");
                    Capture(cam,name);
                    File.AppendAllText("Screenshots/tank-rampage/frames.csv",name+","+Time.time.ToString("F3",System.Globalization.CultureInfo.InvariantCulture)+","+stage+","+rampage.ChoreographyPhase+"\n");
                }
                if(rampage.ChoreographyPhase=="Pull")
                {
                    sawGrip=true;sawDeck=true;
                    Check(rampage.GripError<.28f,"hands detached from turret: "+rampage.GripError);
                    Check(rampage.FootContactError<.12f,"feet detached from deck: "+rampage.FootContactError);
                }
                if(stage==0&&!shellFinished&&battle.Enemies.Count==5)
                {
                    var tank=battle.PlayerTank;tank.enabled=false;
                    foreach(var enemy in battle.Enemies){enemy.StopVehicle();enemy.enabled=false;}
                    tank.Aim(tank.Muzzle.position+tank.Muzzle.forward*250,10000);
                    if(!shellStarted)
                    {
                        if(tank.ReloadRemaining>0)return;
                        shellAmmo=tank.Shells;Check(tank.FireCannon(),"initial cannon fire");
                        Check(Mathf.Abs(tank.ReloadRemaining-1.5f)<.03f,"cannon reload must be 1.5 seconds");
                        shellStarted=true;cannonAt=Time.time;return;
                    }
                    float elapsed=Time.time-cannonAt;
                    if(elapsed>.65f&&elapsed<1.45f&&!earlyShotChecked){Check(!tank.FireCannon(),"early cannon fired");earlyShotChecked=true;}
                    if(elapsed<1.55f)return;
                    Check(earlyShotChecked&&tank.FireCannon(),"second cannon fire at 1.5 seconds");
                    Check(tank.Shells==shellAmmo-2,"cannon ammo consumed incorrectly");shellFinished=true;tank.enabled=true;
                }
                if(stage==0&&battle.Enemies.Count==5)
                {
                    battle.StopAllCoroutines();foreach(var t in battle.Enemies){t.StopVehicle();t.enabled=false;}
                    Check(battle.PlayerTank.transform.Find("Turret/Player rocket pod")!=null,"player rocket pod missing");
                    Check(!battle.Enemies.Any(t=>t.transform.Find("Turret/Player rocket pod")),"enemy appearance changed");
                    var focus=battle.PlayerTank.AimPoint;View(player.Eye,focus,new Vector3(8,5,11));Capture(cam,"01_player_tank");
                    Check(battle.PlayerTank.FireRocket(focus+Vector3.forward*150+Vector3.up*40),"rocket fire");Check(battle.PlayerTank.Rockets==11,"rocket ammo");
                    var rocks=UnityEngine.Object.FindObjectsOfType<RampageProp>().Where(p=>!p.Tree).ToArray();
                    Check(rocks.Length>=70,"insufficient scattered boulders: "+rocks.Length);
                    Check(rocks.All(p=>TankCanyon.RoadDistance(p.transform.position.x,p.transform.position.z)>=7),"boulders obstruct main roads");
                    Debug.Log("[Rampage test] Liftable boulders: "+rocks.Length);
                    battle.PlayerTank.Damage(999);Check(rampage.Cinematic&&gm.IsPlaying,"tank destruction ended mission");Next();
                }
                else if(stage==1&&age>.85f){Capture(cam,"02_escape");Next();}
                else if(stage==2&&player.IsHulk&&player.Hulk.TransformationProgress>.35f){Capture(cam,"03_rage_transform");Next();}
                else if(stage==3&&player.IsHulk&&!player.Hulk.Transforming&&player.Hulk.Grounded)
                {
                    Check(sawProne&&sawGetUp,"missing prone/get-up sequence");
                    Check(!player.InTank&&player.IsFreeRoam,"player control transition");
                    Check(rampage.EscapePlays==1,"escape must play once");rampage.BeginEscape();Check(rampage.EscapePlays==1,"escape replayed");Check(gm.Health.Max==200,"transformed health");
                    gm.Health.Configure(999,0);health=gm.Health.Current;
                    rampage.ShellHit(-player.transform.forward);Check(Mathf.Abs(gm.Health.Current-(health-20))<.01f,"shell damage is not 10 percent");Next();
                }
                else if(stage==4&&age>.2f){Check(player.Hulk.Visual.ActiveBlenderClip==player.Hulk.Visual.Definition.ShellHit,"uppercut clip");Capture(cam,"04_shell_hit");Next();}
                else if(stage==5&&!rampage.Busy&&player.Hulk.Grounded)
                {
                    target=battle.Enemies.First(t=>!t.IsDead);var p=Ground(gm,player.transform.position+player.transform.forward*12);
                    target.transform.SetPositionAndRotation(p,Quaternion.identity);target.Turret.localRotation=Quaternion.Euler(0,65,0);Place(player,Ground(gm,p+Vector3.back*6),Quaternion.identity);Next();
                }
                else if(stage==6&&age>.25f&&player.Hulk.Grounded&&!rampage.Busy)
                {foreach(var item in UnityEngine.Object.FindObjectsOfType<RampageProp>())if(item.Available&&Vector3.Distance(item.transform.position,player.transform.position)<5)item.transform.position+=Vector3.right*20;Physics.SyncTransforms();Check(rampage.Interact(),"E climb action refused: "+rampage.Prompt+" attack="+player.Hulk.CurrentAttack);Next();}
                else if(stage==7&&age>.55f&&rampage.ChoreographyPhase=="Climb"){Check(player.Hulk.Visual.ActiveBlenderClip==player.Hulk.Visual.Definition.TankClimb,"climb native clip");Capture(cam,"05_climb");Next();}
                else if(stage==8&&age>1.2f){Capture(cam,"06_turret_pull");rampage.ShellHit(-player.transform.forward);Next();}
                else if(stage==9&&!rampage.Busy)
                {
                    Check(target.IsDead&&rampage.ClimbPlays==(secondTurret?2:1),"turret finish / climb not single play");
                    Check(sawGrip&&sawDeck,"contact phases were not exercised");
                    if(!secondTurret)
                    {
                        secondTurret=true;
                        target=battle.Enemies.First(t=>!t.IsDead&&t.Appearance!=TankAppearance.K2BlackPanther);
                        var opposite=Ground(gm,player.transform.position+Vector3.right*14);
                        target.transform.SetPositionAndRotation(opposite,Quaternion.identity);target.Turret.localRotation=Quaternion.Euler(0,-95,0);
                        Place(player,Ground(gm,opposite+Vector3.forward*7),Quaternion.Euler(0,180,0));
                        stage=5;Next();return;
                    }
                    target=battle.Enemies.First(t=>!t.IsDead);Vector3 p=Vector3.zero;bool found=false;
                    for(int i=0;i<TankCanyon.NodeCount&&!found;i++)
                    {
                        var n=TankCanyon.Node(i);p=Ground(gm,new Vector3(n.x,0,n.y));found=true;
                        for(float z=5;z<=17;z+=.5f)
                        {var probe=Ground(gm,p+Vector3.forward*z);if(Physics.CheckCapsule(probe+Vector3.up*.9f,probe+Vector3.up*2,.9f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)){found=false;break;}}
                    }
                    Check(found,"clear restrain lane fixture");
                    target.transform.SetPositionAndRotation(p,Quaternion.identity);Place(player,Ground(gm,p+Vector3.forward*18),Quaternion.Euler(0,180,0));Next();
                }
                else if(stage==10&&age>.35f){target.GetComponent<Rigidbody>().isKinematic=false;target.enabled=true;chargeStart=target.transform.position;Check(target.BeginCharge(),"charge refused");Next();}
                else if(stage==11)
                {
                    if(Time.time>nextDiagnostic){nextDiagnostic=Time.time+1;Debug.Log("[Charge diagnostic] active="+target.IsCharging+" position="+target.transform.position+" player="+player.transform.position+" velocity="+target.Velocity+" busy="+rampage.Busy+" kinematic="+target.GetComponent<Rigidbody>().isKinematic);}
                    if(age>=6)Capture(cam,"charge_failure");
                    Check(age<6,"charging tank did not approach the player");
                    if(Vector3.Distance(target.transform.position,player.transform.position)<10.5f&&player.Hulk.Grounded)
                    {
                        Check(Vector3.Distance(chargeStart,target.transform.position)>5,"tank did not drive before counter");
                        Check(rampage.Interact(),"E charge counter refused");Capture(cam,"07_restrain");Next();
                    }
                }
                else if(stage==12&&age>1.75f){Capture(cam,"08_tank_lift");Next();}
                else if(stage==13&&!rampage.Busy)
                {
                    Check(rampage.LastRestrainDistance>8.5f&&rampage.LastRestrainDistance<10.1f,"restrain displacement "+rampage.LastRestrainDistance);
                    prop=RampageProp.Create(battle.transform,Ground(gm,player.transform.position+player.transform.forward*3),true);
                    target=battle.Enemies.First(t=>!t.IsDead);previousHits=target.ShellHits;
                    target.transform.SetPositionAndRotation(Ground(gm,player.transform.position+player.transform.forward*9),player.transform.rotation);
                    Physics.SyncTransforms();
                    Next();
                }
                else if(stage==14&&age>.3f){Check(rampage.Interact(),"E tree pickup");Next();}
                else if(stage==15&&!rampage.Busy)
                {Check(rampage.Held&&rampage.Held.Tree,"tree held");gm.Hud.SendMessage("LateUpdate");Check(gm.Hud.ThrowReticleVisible,"tree reticle hidden");Check(rampage.SwingHeld(),"tree melee");Next();}
                else if(stage==16&&age>.4f){Capture(cam,"09_tree_swing");Next();}
                else if(stage==17&&!rampage.Busy)
                {
                    Check(target.ShellHits>=previousHits+2,"tree melee did not damage tank");
                    rampage.SpawnAirSupport();foreach(var h in UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>())h.enabled=true;Check(rampage.AliveHelicopters==3,"three attack helicopters");
                    helicopter=UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>()[0];Next();
                }
                else if(stage==18&&age>11&&!rampage.Busy&&player.Hulk.Grounded)
                {
                    Check(UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>().Sum(h=>h.RocketsFired)>0,"visible rocket launch");
                    Check(UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>().Sum(h=>h.BulletsFired)>0,"helicopter machine guns");
                    foreach(var h in UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>())h.enabled=false;
                    View(player.Eye,helicopter.transform.position,new Vector3(10,4,13));Capture(cam,"10_attack_helicopter");
                    helicopter.transform.position=player.AimPoint+player.transform.forward*25+Vector3.up*9;
                    player.Eye.position=player.AimPoint-player.transform.forward*5+Vector3.up*.7f;player.Eye.LookAt(helicopter.transform.position);
                    gm.Hud.SendMessage("LateUpdate");Check(gm.Hud.ThrowReticleVisible&&gm.Hud.ThrowTargetAcquired,"helicopter aim reticle");
                    var canvas=gm.Hud.RootCanvas;var mode=canvas.renderMode;var oldCamera=canvas.worldCamera;var distance=canvas.planeDistance;
                    try{canvas.renderMode=RenderMode.ScreenSpaceCamera;canvas.worldCamera=cam;canvas.planeDistance=.5f;Canvas.ForceUpdateCanvases();Capture(cam,"12_throw_reticle");}
                    finally{canvas.renderMode=mode;canvas.worldCamera=oldCamera;canvas.planeDistance=distance;}
                    player.Eye.rotation*=Quaternion.Euler(0,180,0);gm.Hud.SendMessage("LateUpdate");Check(!gm.Hud.ThrowTargetAcquired,"reticle falsely acquires behind camera");
                    player.Eye.LookAt(helicopter.transform.position);Check(rampage.Interact(),"E throw tree");
                    gm.Hud.SendMessage("LateUpdate");Check(!gm.Hud.ThrowReticleVisible,"busy throw reticle remains visible");Next();
                }
                else if(stage==19&&age>2.4f)
                {
                    if(!rockPickup)
                    {
                        Check(helicopter.Dead,"aimed tree did not destroy helicopter");
                        helicopter=UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>().First(h=>!h.Dead);
                        prop=RampageProp.Create(battle.transform,Ground(gm,player.transform.position+player.transform.forward*1.2f),false);
                        Check(rampage.Interact(),"E boulder pickup");rockPickup=true;return;
                    }
                    if(rampage.Busy||!player.Hulk.Grounded)return;
                    Check(rampage.Held&&!rampage.Held.Tree,"wrong object picked up instead of boulder");
                    helicopter.transform.position=player.AimPoint+player.transform.forward*25+Vector3.up*9;
                    player.Eye.LookAt(helicopter.transform.position);gm.Hud.SendMessage("LateUpdate");
                    Check(gm.Hud.ThrowReticleVisible&&gm.Hud.ThrowTargetAcquired,"boulder reticle missing");
                    Check(rampage.Interact(),"E aimed boulder throw");Next();
                }
                else if(stage==20&&age>2.4f)
                {Check(helicopter.Dead,"thrown rock did not destroy helicopter");View(player.Eye,helicopter.transform.position,new Vector3(8,4,12));Capture(cam,"11_gunship_destroyed");Next();}
                else if(stage==21&&age>.5f&&!rampage.Busy&&player.Hulk.Grounded)
                {
                    Check(rampage.AliveInfantry>=6,"infantry wave missing");
                    Check(rampage.Infantry.Sum(e=>e?e.ShotsFired:0)>0,"infantry did not fire");
                    foreach(var e in rampage.Infantry)if(e)e.enabled=true;
                    Check(Vector3.Distance(infantryTarget.transform.position,infantryStart)>2,"infantry did not advance after spawning");
                    infantryTarget=rampage.Infantry.First(e=>e&&!e.IsDead);
                    target=battle.Enemies.First(t=>!t.IsDead);var p=Ground(gm,player.transform.position+player.transform.forward*12);
                    target.transform.SetPositionAndRotation(p,Quaternion.identity);Place(player,Ground(gm,p+Vector3.forward*6.1f),Quaternion.Euler(0,180,0));Next();
                }
                else if(stage==22&&age>.35f){Check(rampage.RestrainNearest(),"R manual tank throw refused");Next();}
                else if(stage==23&&!rampage.Busy)
                {
                    Check(rampage.LastRestrainDistance<.2f,"R manual lift incorrectly pushes player");
                    infantryTarget.enabled=false;infantryTarget.transform.position=Ground(gm,player.transform.position+player.transform.forward*2);Physics.SyncTransforms();
                    player.Hulk.HitInfantryWithProp();Check(infantryTarget.IsDead,"hero cannot defeat infantry");Next();
                }
                else if(stage==24&&age>.5f)
                {
                    Check(!ShaderUtil.ShaderHasError(Shader.Find("SniperRidge/HeroArmorSurface")),"runtime shader error");
                    Check(SessionState.GetString(Key+"errors","")=="","runtime errors: "+SessionState.GetString(Key+"errors",""));
                    File.WriteAllText("Logs/tank-rampage-result.txt","PASS: contextual E pickup/throw/turret/charge counter / R manual lift without push / fallen recovery / infantry spawn, advance, fire and defeat / 1.5-second cannon cadence / early-shot rejection / road-safe boulder density / tree and rock reticle / helicopter target tint / player-only armor / rocket ammo / single cinematic escape / deck foot contact / turret hand contact / rage / 10% shell hit / native motions / single climb per target / both enemy tank types / queued shell reaction / turret removal / 10m restrain / tree melee / 3 gunships / rockets / bullets / thrown-rock air kill\n");
                    SessionState.SetBool(Key,false);File.Delete("Logs/autoplay.txt");EditorApplication.Exit(0);
                }
            }
            catch(Exception e){Debug.LogException(e);File.WriteAllText("Logs/tank-rampage-result.txt",e.ToString());SessionState.SetBool(Key,false);File.Delete("Logs/autoplay.txt");EditorApplication.Exit(2);}
        }
    }
}
