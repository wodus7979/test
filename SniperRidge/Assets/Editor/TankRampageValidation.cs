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
        static TankVehicle target;
        static RampageProp prop;
        static EnemyAttackHelicopter helicopter;
        static TankRampageValidation(){EditorApplication.update+=Poll;Application.logMessageReceived+=(message,stack,type)=>{if(SessionState.GetBool(Key,false)&&(type==LogType.Exception||type==LogType.Error||type==LogType.Assert))SessionState.SetString(Key+"errors",SessionState.GetString(Key+"errors","")+message+"\n");};}
        static void Check(bool ok,string text){if(!ok)throw new Exception("Tank rampage: "+text);}
        public static void Run()
        {
            var set=Resources.Load<NativeMutantSet>(HulkVisual.Resource);
            foreach(var clip in new[]{set.TankClimb,set.TankPull,set.TankThrow,set.TankRestrain,set.ShellHit})Check(clip&&clip.length>.5f,"native clip missing");
            var shader=Shader.Find("SniperRidge/HeroArmorSurface");Check(shader&&shader.isSupported&&!ShaderUtil.ShaderHasError(shader),"PBR shader compilation");
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/autoplay.txt","mode=8\nwait=180\ntag=tank_rampage\nquit=1\n");
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
                Check(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)<260,"Play timeout at stage "+stage);
                var gm=GameManager.Instance;
                if(!EditorApplication.isPlaying||!gm||!gm.IsPlaying||!gm.Armor||last==Time.frameCount)return;
                last=Time.frameCount;var battle=gm.Armor;var rampage=battle.Rampage;var player=gm.Player;var cam=player.Eye.GetComponent<Camera>();float age=Time.time-at;
                if(stage==0&&battle.Enemies.Count==5)
                {
                    battle.StopAllCoroutines();foreach(var t in battle.Enemies){t.StopVehicle();t.enabled=false;}
                    Check(battle.PlayerTank.transform.Find("Turret/Player rocket pod")!=null,"player rocket pod missing");
                    Check(!battle.Enemies.Any(t=>t.transform.Find("Turret/Player rocket pod")),"enemy appearance changed");
                    var focus=battle.PlayerTank.AimPoint;View(player.Eye,focus,new Vector3(8,5,11));Capture(cam,"01_player_tank");
                    Check(battle.PlayerTank.FireRocket(focus+Vector3.forward*150+Vector3.up*40),"rocket fire");Check(battle.PlayerTank.Rockets==11,"rocket ammo");
                    Check(UnityEngine.Object.FindObjectsOfType<RampageProp>().Length>=8,"too few liftable trees/rocks");
                    battle.PlayerTank.Damage(999);Check(rampage.Cinematic&&gm.IsPlaying,"tank destruction ended mission");Next();
                }
                else if(stage==1&&age>.85f){Capture(cam,"02_escape");Next();}
                else if(stage==2&&player.IsHulk&&player.Hulk.TransformationProgress>.35f){Capture(cam,"03_rage_transform");Next();}
                else if(stage==3&&player.IsHulk&&!player.Hulk.Transforming&&player.Hulk.Grounded)
                {
                    Check(!player.InTank&&player.IsFreeRoam,"player control transition");Check(gm.Health.Max==200,"transformed health");
                    gm.Health.Configure(999,0);health=gm.Health.Current;
                    rampage.ShellHit(-player.transform.forward);Check(Mathf.Abs(gm.Health.Current-(health-20))<.01f,"shell damage is not 10 percent");Next();
                }
                else if(stage==4&&age>.2f){Check(player.Hulk.Visual.ActiveBlenderClip==player.Hulk.Visual.Definition.ShellHit,"uppercut clip");Capture(cam,"04_shell_hit");Next();}
                else if(stage==5&&!rampage.Busy&&player.Hulk.Grounded)
                {
                    target=battle.Enemies.First(t=>!t.IsDead);var p=Ground(gm,player.transform.position+player.transform.forward*12);
                    target.transform.SetPositionAndRotation(p,Quaternion.identity);Place(player,Ground(gm,p+Vector3.back*6),Quaternion.identity);Next();
                }
                else if(stage==6&&age>.25f)
                {Check(rampage.StartTankAction(target,false),"climb action refused");Next();}
                else if(stage==7&&age>.55f){Check(player.Hulk.Visual.ActiveBlenderClip==player.Hulk.Visual.Definition.TankClimb,"climb native clip");Capture(cam,"05_climb");Next();}
                else if(stage==8&&age>1.2f){Capture(cam,"06_turret_pull");Next();}
                else if(stage==9&&!rampage.Busy)
                {
                    Check(target.IsDead&&rampage.ClimbPlays==1,"turret finish / climb not single play");
                    target=battle.Enemies.First(t=>!t.IsDead);Vector3 p=Vector3.zero;bool found=false;
                    for(int i=0;i<TankCanyon.NodeCount&&!found;i++)
                    {
                        var n=TankCanyon.Node(i);p=Ground(gm,new Vector3(n.x,0,n.y));found=true;
                        for(float z=5;z<=17;z+=.5f)
                        {var probe=Ground(gm,p+Vector3.forward*z);if(Physics.CheckCapsule(probe+Vector3.up*.9f,probe+Vector3.up*2,.9f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)){found=false;break;}}
                    }
                    Check(found,"clear restrain lane fixture");
                    target.transform.SetPositionAndRotation(p,Quaternion.identity);Place(player,Ground(gm,p+Vector3.forward*6.1f),Quaternion.Euler(0,180,0));Next();
                }
                else if(stage==10&&age>.35f){Check(rampage.StartTankAction(target,true),"restrain refused");Next();}
                else if(stage==11&&age>1.0f){Capture(cam,"07_restrain");Next();}
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
                else if(stage==14&&age>.3f){Check(rampage.GrabNearest(),"tree pickup");Next();}
                else if(stage==15&&!rampage.Busy)
                {Check(rampage.Held&&rampage.Held.Tree,"tree held");Check(rampage.SwingHeld(),"tree melee");Next();}
                else if(stage==16&&age>.4f){Capture(cam,"09_tree_swing");Next();}
                else if(stage==17&&!rampage.Busy)
                {
                    Check(target.ShellHits>=previousHits+2,"tree melee did not damage tank");
                    rampage.SpawnAirSupport();Check(rampage.AliveHelicopters==3,"three attack helicopters");
                    helicopter=UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>()[0];Next();
                }
                else if(stage==18&&age>11&&!rampage.Busy&&player.Hulk.Grounded)
                {
                    Check(UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>().Sum(h=>h.RocketsFired)>0,"visible rocket launch");
                    Check(UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>().Sum(h=>h.BulletsFired)>0,"helicopter machine guns");
                    foreach(var h in UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>())h.enabled=false;
                    View(player.Eye,helicopter.transform.position,new Vector3(10,4,13));Capture(cam,"10_attack_helicopter");
                    helicopter.transform.position=player.AimPoint+player.transform.forward*25+Vector3.up*9;
                    player.Eye.position=player.AimPoint-player.transform.forward*5+Vector3.up*.7f;player.Eye.LookAt(helicopter.transform.position);Check(rampage.ThrowHeld(),"throw tree");Next();
                }
                else if(stage==19&&age>2.4f)
                {
                    Check(helicopter.Dead,"aimed tree did not destroy helicopter");
                    helicopter=UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>().First(h=>!h.Dead);
                    // Test a second air target with a separate swept boulder contact.
                    var rock=RampageProp.Create(battle.transform,helicopter.transform.position-Vector3.forward*8,false);rock.PickUp();
                    RampageThrownObject.Launch(rock.gameObject,Vector3.forward,55,4,null);Next();
                }
                else if(stage==20&&age>.5f)
                {Check(helicopter.Dead,"thrown rock did not destroy helicopter");View(player.Eye,helicopter.transform.position,new Vector3(8,4,12));Capture(cam,"11_gunship_destroyed");Next();}
                else if(stage==21&&age>.5f)
                {
                    Check(!ShaderUtil.ShaderHasError(Shader.Find("SniperRidge/HeroArmorSurface")),"runtime shader error");
                    Check(SessionState.GetString(Key+"errors","")=="","runtime errors: "+SessionState.GetString(Key+"errors",""));
                    File.WriteAllText("Logs/tank-rampage-result.txt","PASS: player-only armor / rocket ammo / escape / rage / 10% shell hit / native motions / single climb / turret removal / 10m restrain / tree melee / 3 gunships / rockets / bullets / thrown-rock air kill\n");
                    SessionState.SetBool(Key,false);File.Delete("Logs/autoplay.txt");EditorApplication.Exit(0);
                }
            }
            catch(Exception e){Debug.LogException(e);File.WriteAllText("Logs/tank-rampage-result.txt",e.ToString());SessionState.SetBool(Key,false);EditorApplication.Exit(2);}
        }
    }
}
