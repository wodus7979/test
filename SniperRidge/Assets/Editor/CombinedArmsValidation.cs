using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    [InitializeOnLoad]
    public static class CombinedArmsValidation
    {
        const string Key="CombinedArms.Validation";
        static int stage,last=-1;
        static float at,health;
        static Vector3 start,rockStart;
        static TankVehicle target;
        static RampageProp rock;
        static EnemyAttackHelicopter helicopter;
        static StreetWeapon car;
        static EnemySoldier victim;
        static bool testedProtection;
        static CombinedArmsValidation(){EditorApplication.update+=Poll;Application.logMessageReceived+=(m,s,t)=>{if(SessionState.GetBool(Key,false)&&(t==LogType.Error||t==LogType.Exception||t==LogType.Assert))SessionState.SetString(Key+"errors",SessionState.GetString(Key+"errors","")+m+"\n");};}
        public static void RunTank()=>Run(false);
        public static void RunCity()=>Run(true);
        static void Run(bool city)
        {
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/autoplay.txt","mode="+(city?9:8)+"\nwait=500\ntag=combined_arms\nquit=1\n");
            SessionState.SetBool(Key+"city",city);SessionState.SetBool(Key,true);SessionState.SetString(Key+"errors","");SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Check(bool value,string message){if(!value)throw new Exception("Combined arms: "+message);}
        static void Next(){stage++;at=Time.time;Debug.Log("[Combined arms] Stage "+stage);}
        static Vector3 Ground(GameManager gm,Vector3 p){p.y=TerrainGenerator.GroundHeight(gm.Terrain,p.x,p.z)+.1f;return p;}
        static void Place(SniperController p,Vector3 position){var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.SetPositionAndRotation(position,Quaternion.identity);c.enabled=true;Physics.SyncTransforms();}
        static void Capture(GameManager gm,string name)
        {
            var cam=gm.PlayerEye.GetComponent<Camera>();var rt=new RenderTexture(1200,750,24);var tex=new Texture2D(1200,750,TextureFormat.RGB24,false);var old=cam.targetTexture;var active=RenderTexture.active;
            try{cam.targetTexture=rt;cam.Render();RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,1200,750),0,0);tex.Apply();Directory.CreateDirectory("Screenshots/combined-arms");File.WriteAllBytes("Screenshots/combined-arms/"+name+".png",tex.EncodeToPNG());}
            finally{cam.targetTexture=old;RenderTexture.active=active;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(tex);}
        }
        static void View(GameManager gm,Vector3 point,Vector3 offset){gm.PlayerEye.position=point+offset;gm.PlayerEye.LookAt(point);}
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            try
            {
                Check(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)<300,"timeout stage "+stage);
                var gm=GameManager.Instance;if(!EditorApplication.isPlaying||!gm||!gm.IsPlaying||last==Time.frameCount)return;
                last=Time.frameCount;float age=Time.time-at;
                if(SessionState.GetBool(Key+"city",false)){City(gm,age);return;}
                var b=gm.Armor;if(!b)return;var r=b.Rampage;var tank=b.PlayerTank;
                if(stage==0&&b.Enemies.Count==3)
                {
                    Check(r.AliveHelicopters==3&&r.AliveInfantry>0,"opening mixed forces missing");
                    b.StopAllCoroutines();foreach(var e in b.Enemies){e.StopVehicle();e.enabled=false;}foreach(var e in r.Infantry)e.enabled=false;
                    foreach(var h in UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>())h.enabled=false;
                    tank.enabled=false;float before=tank.Fraction;tank.Damage(100);Check(Mathf.Abs(tank.Fraction-before+.1f)<.001f,"player armor not 1000");tank.Resupply();
                    health=gm.Health.Current;gm.Health.TakeDamage(100);Check(gm.Health.Current==health,"crew damaged inside tank");
                    helicopter=UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>()[0];
                    helicopter.transform.position=tank.AimPoint+Vector3.up*22+Vector3.forward*12;
                    ArmorProjectile.Launch(helicopter.transform.position-Vector3.forward*10,Vector3.forward,tank.transform,true,150,20,true);
                    // A tank-origin launch must be clear from breech to muzzle; use the actual weapon for the visual check.
                    tank.FireRocket(tank.AimPoint+Vector3.up*35+Vector3.forward*70);
                    Check(UnityEngine.Object.FindObjectsOfType<ParticleSystem>().Any(p=>p.name=="Rocket exhaust flame"),"rocket flame missing");Next();
                }
                else if(stage==1&&age>1.2f)
                {
                    // Direct cannon/rocket hit paths share the same swept collision implementation.
                    var p=helicopter.transform.position-Vector3.forward*8;
                    ArmorProjectile.Launch(p,Vector3.forward,tank.transform,true,150,40,false);Next();
                }
                else if(stage==2&&age>1)
                {
                    Check(helicopter.Dead,"tank projectile did not destroy helicopter");
                    Check(helicopter.GetComponentsInChildren<ParticleSystem>().Any(p=>p.name=="Tank wreck black smoke"&&p.isPlaying),"black smoke not attached to falling wreck");
                    View(gm,helicopter.transform.position,new Vector3(12,5,14));Capture(gm,"gunship-fire");
                    // Use a road lane and a new boulder directly ahead of the tracks.
                    start=tank.transform.position;tank.GetComponent<Rigidbody>().rotation=Quaternion.LookRotation(TankCanyon.EntryDirection);
                    rock=RampageProp.Create(b.transform,Ground(gm,start+tank.transform.forward*6),false);rockStart=rock.transform.position;
                    typeof(TankVehicle).GetField("drive",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(tank,1f);Next();
                }
                else if(stage==3)
                {
                    tank.SendMessage("FixedUpdate");
                    if(age<4)return;
                    Check(Vector3.Distance(rock.transform.position,rockStart)>3,"boulder did not move");Check(Vector3.Distance(tank.transform.position,start)>9,"tank stuck behind rock");
                    tank.StopVehicle();View(gm,tank.AimPoint,new Vector3(12,6,-14));Capture(gm,"rock-cleared");
                    tank.Damage(99999);Next();
                }
                else if(stage==4&&r.CombatReady&&gm.Player.Hulk.Grounded)
                {
                    foreach(var e in r.Infantry)e.enabled=false;
                    target=b.Enemies.First(t=>!t.IsDead);target.transform.position=Ground(gm,gm.Player.transform.position+Vector3.forward*12);target.transform.rotation=Quaternion.identity;
                    Place(gm.Player,Ground(gm,target.transform.position+Vector3.back*6));Next();
                }
                else if(stage==5&&age>.4f&&gm.Player.Hulk.Grounded){Check(r.ClimbNearest(),"turret action rejected");Next();}
                else if(stage==6)
                {
                    if(r.Invulnerable){float hp=gm.Health.Current;int hits=r.ShellReactions;gm.Health.TakeDamage(20,true);r.ShellHit(Vector3.back);Check(gm.Health.Current==hp&&r.ShellReactions==hits,"turret action not protected");testedProtection=true;}
                    if(r.Busy)return;
                    Check(testedProtection&&target.IsDead&&!r.Invulnerable,"turret protection lifecycle");health=gm.Health.Current;gm.Health.TakeDamage(10,true);Check(Mathf.Abs(health-gm.Health.Current-10)<.01f,"invulnerability leaked after action");
                    Finish("tank");
                }
            }
            catch(Exception e){Debug.LogException(e);Finish("FAILED: "+e,2);}
        }
        static void City(GameManager gm,float age)
        {
            if(!gm.Assault)return;var h=gm.Player.Hulk;
            if(stage==4)gm.PlayerEye.rotation=Quaternion.LookRotation(Vector3.forward);
            if(stage==0&&gm.Player.State==SniperController.WeaponState.Ready)
            {
                gm.Assault.StopAllCoroutines();foreach(var e in gm.Assault.Soldiers){e.enabled=false;if(e.Combat)e.Combat.enabled=false;}
                gm.Health.Max=10000;gm.Health.Configure(999,0);Check(h.Toggle(),"city transform failed");Next();
            }
            else if(stage==1&&!h.Transforming&&h.Grounded)
            {
                var arena=new Vector3(1500,40,1500);var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=arena+Vector3.down*.5f;floor.transform.localScale=new Vector3(100,1,100);
                Place(gm.Player,arena+Vector3.up*.1f);
                car=UrbanProps.Place("Abandoned sedan",gm.Assault.transform,arena+Vector3.forward*3,90).GetComponent<StreetWeapon>();
                victim=gm.Assault.Soldiers.First(e=>!e.IsDead&&!e.IsAlly&&!e.Boss);victim.enabled=false;var agent=victim.GetComponent<UnityEngine.AI.NavMeshAgent>();if(agent)agent.enabled=false;var nav=victim.GetComponent<AssaultNavigation>();if(nav)nav.enabled=false;victim.transform.position=arena+Vector3.forward*23;
                var wall=GameObject.CreatePrimitive(PrimitiveType.Cube);wall.transform.position=arena+new Vector3(0,5,26);wall.transform.localScale=new Vector3(30,10,1);
                Physics.SyncTransforms();Next();
            }
            else if(stage==2&&age>.4f&&h.Grounded){Check(h.Street.Interact(),"E car lift rejected");Next();}
            else if(stage==3&&h.CurrentAttack==HulkController.Attack.None)
            {
                Check(h.Street.Held==car,"car pickup not completed");Check(!car.GetComponent<Collider>().enabled,"held car still blocks player");
                View(gm,gm.Player.transform.position+Vector3.up*2,new Vector3(8,4,-10));Capture(gm,"car-carry");
                typeof(HulkController).GetField("yaw",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(h,0f);
                typeof(HulkController).GetField("pitch",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(h,0f);
                gm.PlayerEye.rotation=Quaternion.LookRotation(Vector3.forward);
                Check(h.BeginAttack(HulkController.Attack.Punch),"car throw rejected");Check(h.CurrentAttack==HulkController.Attack.BarrelThrow,"wrong car animation");Next();
            }
            else if(stage==4&&age>4)
            {
                Check(!h.Street.Held&&!car.Flying,"car throw did not finish");
                Check(car.transform.position.y>39.9f,"car wreck sank below physical street");
                Debug.Log("[Car throw] wreck="+car.transform.position+" victim="+victim.transform.position+" hp="+victim.Health);
                View(gm,car.transform.position+Vector3.up,new Vector3(10,4,-12));Capture(gm,"car-wreck");
                Check(victim.IsDead,"thrown car blast did not damage nearby enemy");Check(car.GetComponent<DestructibleVehicle>().Burning,"car did not become a burning wreck");
                Check(car.GetComponent<Collider>().enabled&&!car.Available,"wreck collision/pickup state wrong");
                View(gm,car.transform.position+Vector3.up,new Vector3(10,4,-12));Capture(gm,"car-wreck");Finish("city");
            }
        }
        static void Finish(string name,int code=0)
        {
            string errors=SessionState.GetString(Key+"errors","");if(errors!="")code=2;
            File.WriteAllText("Logs/combined-arms-"+(SessionState.GetBool(Key+"city",false)?"city":"tank")+".txt",(code==0?"PASS ":"FAIL ")+name+"\n"+errors);
            SessionState.SetBool(Key,false);File.Delete("Logs/autoplay.txt");EditorApplication.Exit(code);
        }
    }
}
