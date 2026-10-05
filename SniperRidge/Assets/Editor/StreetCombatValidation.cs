using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    [InitializeOnLoad] public static class StreetCombatValidation
    {
        const string Key="StreetCombat.Validation";static int stage,last=-1;static float at;
        static HulkController hero;static StreetWeapon barrel,pole;static EnemySoldier victim;
        static Camera camera;static bool worldOnly;static EnemyGrenadier grenadier;static float healthBefore;
        static StreetCombatValidation(){EditorApplication.update+=Poll;}
        static void Check(bool ok,string text){if(!ok)throw new Exception("Street combat: "+text);}
        public static void WorldOnly(){SessionState.SetBool(Key+"world",true);Run();}
        public static void Run()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");File.Delete("Logs/autoplay_result.txt");
            File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=65\ntag=street_combat\nquit=1\n");
            SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Next(){stage++;at=Time.time;}
        static void Capture(string label)
        {
            if(hero&&hero.Street)hero.Street.SyncPose();
            if(!camera)camera=new GameObject("Street inspection camera").AddComponent<Camera>();
            camera.CopyFrom(GameManager.Instance.PlayerEye.GetComponent<Camera>());camera.enabled=false;camera.fieldOfView=55;
            var focus=label=="enemy_grenade"?victim.transform:hero.transform;
            camera.transform.position=focus.TransformPoint(new Vector3(4,2.5f,4));camera.transform.LookAt(focus.position+Vector3.up*1.4f);
            var rt=new RenderTexture(1280,800,24);var tex=new Texture2D(1280,800,TextureFormat.RGB24,false);var old=RenderTexture.active;
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,1280,800),0,0);tex.Apply();Directory.CreateDirectory("Screenshots/street-combat");File.WriteAllBytes("Screenshots/street-combat/"+label+".png",tex.EncodeToPNG());}
            finally{camera.targetTexture=null;RenderTexture.active=old;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(tex);}
        }
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            try
            {
                Check(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)<240,"timeout at stage "+stage);
                var gm=GameManager.Instance;
                if(EditorApplication.isPlaying&&gm&&gm.IsPlaying&&gm.Assault&&last!=Time.frameCount)
                {
                    last=Time.frameCount;var player=gm.Player;float age=Time.time-at;
                    if(hero&&hero.Active){hero.Move(Vector2.zero,Time.deltaTime);hero.Tick(0);}
                    if(stage==0&&player.State==SniperController.WeaponState.Ready)
                    {
                        worldOnly=SessionState.GetBool(Key+"world",false);SessionState.SetBool(Key+"world",false);
                        UrbanCombatStreets.ValidateRoutes();AssaultWorld.ValidateNavigation();
                        Check(UrbanCombatStreets.LastVehicleCount>=12,"too few random road vehicles: "+UrbanCombatStreets.LastVehicleCount);
                        var props=UnityEngine.Object.FindObjectsOfType<StreetWeapon>();
                        Check(props.Count(p=>p.Kind==StreetWeapon.PropKind.Barrel)>=20,"missing barrels");Check(props.Count(p=>p.Kind==StreetWeapon.PropKind.Pole)>=8,"missing poles");
                        Check(gm.Assault.Soldiers.Count(e=>!e.IsAlly&&Mathf.Abs(e.transform.position.x)>60)>=8,"side streets lack enemies");
                        Check(gm.Assault.Soldiers.Count(e=>!e.IsAlly&&e.Role==EnemyRole.RocketTrooper)>=4,"missing hostile rocket troops");
                        Debug.Log("[Street world] PASS: "+UrbanCombatStreets.LastVehicleCount+" random vehicles, "+props.Length+" interactive props, five connected avenues and flank enemies.");
                        gm.Assault.StopAllCoroutines();gm.Assault.enabled=false;player.enabled=false;
                        foreach(var enemy in gm.Assault.Soldiers){enemy.enabled=false;var nav=enemy.GetComponent<AssaultNavigation>();if(nav)nav.Move(Vector3.zero,0,0);var g=enemy.GetComponent<EnemyGrenadier>();if(g)g.enabled=false;}
                        hero=player.Hulk;Check(hero.Toggle(),"transform rejected");Next();
                    }
                    else if(stage==1&&age>HulkController.TransformDuration+.5f)
                    {hero.NotifyHit();hero.NotifyHit();hero.NotifyHit();Next();}
                    else if(stage==2&&age>.4f)
                    {
                        Check(hero.Blocking&&hero.Visual.Motion=="Block"&&hero.Visual.ActiveBlenderClip==hero.Visual.Definition.Block,"idle blends under guard");Capture("guard");
                        if(worldOnly){Debug.Log("[Street guard] PASS: native full-body block replaces idle.");stage=99;}else Next();
                    }
                    else if(stage==3&&age>1.4f)
                    {
                        Check(hero.Visual.Definition.ThrowIn&&hero.Visual.Definition.Harvesting&&hero.Visual.Definition.PoleAttack,"requested Mixamo clips missing");
                        barrel=StreetWeapon.Create(gm.Assault.transform,hero.transform.position+hero.transform.forward*2,StreetWeapon.PropKind.Barrel);
                        var wall=GameObject.CreatePrimitive(PrimitiveType.Cube);wall.transform.position=hero.transform.position+hero.transform.forward+Vector3.up;wall.transform.localScale=new Vector3(4,3,.2f);
                        Physics.SyncTransforms();Check(hero.Street.Nearest()!=barrel,"pickup reaches through wall");wall.SetActive(false);UnityEngine.Object.Destroy(wall);
                        Physics.SyncTransforms();Check(hero.Street.Interact()&&hero.Street.Held==barrel,"barrel pickup failed");Next();
                    }
                    else if(stage==4&&age>.3f)
                    {Capture("barrel_carry");Check(hero.BeginAttack(HulkController.Attack.Punch)&&hero.CurrentAttack==HulkController.Attack.BarrelThrow,"barrel attack dispatch");Next();}
                    else if(stage==5&&age>hero.Visual.Definition.ThrowIn.length/HeroStreetInteraction.PlaybackRate*.6f)
                    {Check(!hero.Street.Held&&barrel&&barrel.Flying,"barrel not released at throw");Capture("barrel_throw");Next();}
                    else if(stage==6&&age>9)
                    {
                        Check(!barrel,"barrel never detonated");
                        pole=StreetWeapon.Create(gm.Assault.transform,hero.transform.position+hero.transform.forward*2,StreetWeapon.PropKind.Pole);
                        Physics.SyncTransforms();Check(hero.Street.Interact()&&hero.CurrentAttack==HulkController.Attack.Uproot,"uproot rejected");Next();
                    }
                    else if(stage==7&&age>hero.Visual.Definition.Harvesting.length/HeroStreetInteraction.PlaybackRate+.1f)
                    {
                        Check(hero.Street.Held==pole&&pole.Uprooted&&!pole.GetComponent<Collider>().enabled,"pole not uprooted/held");Capture("pole_carry");
                        victim=LevelBuilder.SpawnAssaultSoldier(gm,hero.transform.position+hero.transform.forward*4,false,188,EnemyRole.MachineGunner);victim.enabled=false;victim.GetComponent<AssaultNavigation>().Move(Vector3.zero,0,0);gm.Assault.Soldiers.Add(victim);
                        Check(hero.BeginAttack(HulkController.Attack.Punch)&&hero.CurrentAttack==HulkController.Attack.PoleSwing,"pole swing dispatch");Next();
                    }
                    else if(stage==8&&age>hero.Visual.Definition.PoleAttack.length/HeroStreetInteraction.PlaybackRate*.48f)
                    {Check(victim.IsDead,"pole did not damage enemy");Capture("pole_swing");Next();}
                    else if(stage==9&&hero.CurrentAttack==HulkController.Attack.None)
                    {
                        hero.Street.Drop();Check(!hero.Street.Held&&pole.GetComponent<Collider>().enabled,"drop loses collider");
                        Check(hero.Toggle(),"FPS return failed");Debug.Log("[Street interactions] PASS: guard without idle, barrel pickup/Throw In/release/explosion, Harvesting uproot, Sword And Shield Attack hit, drop and FPS return.");
                        victim=LevelBuilder.SpawnAssaultSoldier(gm,player.transform.position+Vector3.forward*17,false,189,EnemyRole.MachineGunner);victim.enabled=false;
                        victim.transform.rotation=Quaternion.LookRotation(player.transform.position-victim.transform.position);victim.GetComponent<AssaultNavigation>().Move(Vector3.zero,0,0);
                        gm.Assault.Soldiers.Add(victim);grenadier=victim.gameObject.AddComponent<EnemyGrenadier>();Next();
                    }
                    else if(stage==10&&age>.4f)
                    {
                        typeof(EnemyGrenadier).GetField("cooldown",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).SetValue(grenadier,0f);
                        Check(grenadier.TryThrow(player.AimPoint),"enemy grenade windup rejected");healthBefore=gm.Health.Current;Next();
                    }
                    else if(stage==11&&age>EnemyGrenadier.ReleaseTime+.15f)
                    {Check(grenadier.Throws==1&&UnityEngine.Object.FindObjectsOfType<EnemyGrenade>().Length==1,"enemy did not release one grenade");Capture("enemy_grenade");Next();}
                    else if(stage==12&&age>4)
                    {
                        Check(UnityEngine.Object.FindObjectsOfType<EnemyGrenade>().Length==0,"grenade fuse never detonated");
                        Check(gm.Health.Current<healthBefore,"enemy grenade never damages player");grenadier.enabled=false;
                        InfantryRocket.Launch(victim,victim.Head.position+victim.transform.forward,player.AimPoint);Next();
                    }
                    else if(stage==13&&age>1.2f)
                    {Check(UnityEngine.Object.FindObjectsOfType<InfantryRocket>().Length==0,"rocket did not collide");Debug.Log("[Enemy ordnance] PASS: Grenade Throw release, fuse, blast damage and visible rocket collision.");stage=99;}
                }
                if(!EditorApplication.isPlaying&&File.Exists("Logs/autoplay_result.txt"))
                {Check(stage==99&&File.ReadAllText("Logs/autoplay_result.txt").Contains("errors=0"),"test ended before completion: "+stage);SessionState.SetBool(Key,false);if(Application.isBatchMode)EditorApplication.Exit(0);}
            }
            catch(Exception e){Debug.LogException(e);SessionState.SetBool(Key,false);if(Application.isBatchMode)EditorApplication.Exit(1);}
        }
    }
}
