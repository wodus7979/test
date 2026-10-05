using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
namespace SniperRidge.EditorTools
{
    [InitializeOnLoad] public static class VehiclePbrValidation
    {
        const string Key="VehiclePbr.Validation";static int stage,last=-1,punches,busHits,fireFrames;static float at,nextFrame;
        static bool impactRecorded;
        static DestructibleVehicle car,bus;static HulkController hero;static Camera preview;
        static Vector3 restingPosition;static Quaternion restingRotation;
        static VehiclePbrValidation(){EditorApplication.update+=Poll;}
        static void Check(bool ok,string message){if(!ok)throw new Exception("Vehicle PBR: "+message);}
        static void Next(){stage++;at=Time.time;}
        public static void Run()
        {
            foreach(var name in new[]{"VehicleSurface","VehicleGlass"})
            {var s=Resources.Load<Shader>("Shaders/"+name);Check(s&&!ShaderUtil.ShaderHasError(s),"shader compile error: "+name);}
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");File.Delete("Logs/autoplay_result.txt");
            File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=65\ntag=vehicle_pbr\nquit=1\n");
            SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Capture(string name,Transform target,float scale=1)
        {
            if(!preview)preview=new GameObject("Vehicle inspection camera").AddComponent<Camera>();
            preview.CopyFrom(GameManager.Instance.PlayerEye.GetComponent<Camera>());preview.enabled=false;preview.fieldOfView=43;
            preview.transform.position=target.TransformPoint(new Vector3(target.position.x>0?-3.3f:3.3f,2.7f,7.6f)*scale);
            preview.transform.LookAt(target.position+Vector3.up*(scale>1?1.4f:.8f));
            var rt=new RenderTexture(1440,900,24);var tex=new Texture2D(1440,900,TextureFormat.RGB24,false);var old=RenderTexture.active;
            try{preview.targetTexture=rt;preview.Render();RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,1440,900),0,0);tex.Apply();Directory.CreateDirectory("Screenshots/vehicle-pbr");File.WriteAllBytes("Screenshots/vehicle-pbr/"+name+".png",tex.EncodeToPNG());}
            finally{preview.targetTexture=null;RenderTexture.active=old;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(tex);}
        }
        static void Teleport(SniperController p,Vector3 pos,Quaternion rotation)
        {var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.SetPositionAndRotation(pos,rotation);c.enabled=true;Physics.SyncTransforms();}
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            try
            {
                Check(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)<210,"timeout stage "+stage);
                var gm=GameManager.Instance;
                if(EditorApplication.isPlaying&&gm&&gm.IsPlaying&&gm.Assault&&last!=Time.frameCount)
                {
                    last=Time.frameCount;var p=gm.Player;float age=Time.time-at;
                    if(hero&&hero.Active){hero.Move(Vector2.zero,Time.deltaTime,false);hero.Tick(0);}
                    if(stage==0&&p.State==SniperController.WeaponState.Ready)
                    {
                        gm.Assault.StopAllCoroutines();gm.Assault.enabled=false;p.enabled=false;gm.Health.Max=10000;gm.Health.Configure(0,10000);
                        foreach(var e in gm.Assault.Soldiers){e.enabled=false;if(e.Combat)e.Combat.enabled=false;var n=e.GetComponent<AssaultNavigation>();if(n)n.enabled=false;var a=e.GetComponent<NavMeshAgent>();if(a)a.enabled=false;}
                        var cars=UnityEngine.Object.FindObjectsOfType<DestructibleVehicle>();Check(cars.Length>=20,"map vehicles missing");
                        foreach(var c in cars)
                        {
                            Check(!c.GetComponent<Renderer>().isPartOfStaticBatch,"deformable vehicle included in static batch");
                            Check(c.GetComponent<MeshCollider>().sharedMesh==c.GetComponent<MeshFilter>().sharedMesh,"render/collision mesh mismatch before hit");
                            foreach(var m in c.GetComponent<Renderer>().sharedMaterials)Check(m.shader.isSupported&&!ShaderUtil.ShaderHasError(m.shader),"unsupported vehicle shader");
                        }
                        car=cars.Where(c=>c.name=="Abandoned sedan").OrderBy(c=>Vector3.Distance(c.transform.position,p.transform.position)).First();
                        restingPosition=car.transform.position;restingRotation=car.transform.rotation;Next();
                    }
                    else if(stage==1&&age>3)
                    {
                        var cars=UnityEngine.Object.FindObjectsOfType<DestructibleVehicle>();
                        foreach(string name in new[]{"Abandoned sedan","Offroad SUV","City bus"})
                        {var c=cars.Where(x=>x.name==name).OrderBy(x=>Mathf.Abs(x.transform.position.x)).First();Capture(name.Replace(' ','_'),c.transform,name=="City bus"?1.7f:1);}
                        VehicleCoverValidation.Validate();
                        var pos=car.transform.TransformPoint(new Vector3(3.15f,0,0));pos.y=AssaultLayout.Ground+.1f;
                        Teleport(p,pos,car.transform.rotation*Quaternion.Euler(0,-90,0));hero=p.Hulk;Check(hero.Toggle(),"Hulk transform failed");Next();
                    }
                    else if(stage==2&&age>HulkController.TransformDuration+.35f)
                    {Check(hero.BeginAttack(HulkController.Attack.Punch),"punch rejected");impactRecorded=false;Next();}
                    else if(stage==3)
                    {
                        if(age>HulkController.PunchImpactTime+.06f&&!impactRecorded)
                        {
                            Check(car.Reacting,"hit has no suspension reaction");
                            Check(Vector3.Distance(car.transform.position,restingPosition)>.001f||Quaternion.Angle(car.transform.rotation,restingRotation)>.02f,"vehicle does not visibly react");
                            Capture("sedan_impact_"+(punches+1),car.transform);impactRecorded=true;
                        }
                        if(age<=HulkController.PunchDuration+.25f)return;
                        punches++;Check(car.Hits==punches,"one attack did not equal one hit: "+car.Hits);
                        Check(car.gameObject.activeInHierarchy&&car.GetComponent<Renderer>().enabled,"car hidden after hit");
                        var mesh=car.GetComponent<MeshFilter>().sharedMesh;
                        Check(mesh&&mesh.vertexCount>1000&&mesh.subMeshCount==car.GetComponent<Renderer>().sharedMaterials.Length,"render mesh lost after hit");
                        Check(mesh.bounds.size.x>1&&mesh.bounds.size.z<5,"dent mesh uses static batch/world coordinates");
                        Check(car.GetComponent<MeshCollider>().sharedMesh==mesh,"damaged collider differs");
                        Check(car.Destroyed==(punches==5)&&car.Burning==(punches==5),"incorrect destruction threshold");
                        Check(car.Smoking==(punches>=2),"smoke must begin at hit two");
                        Check(Vector3.Distance(car.transform.position,restingPosition)<.0001f&&Quaternion.Angle(car.transform.rotation,restingRotation)<.01f,"suspension did not settle");
                        var damage=new MaterialPropertyBlock();car.GetComponent<Renderer>().GetPropertyBlock(damage);
                        Check(damage.GetVector("_Hit"+(punches-1)).w>.5f,"missing impact surface mark");
                        Capture("sedan_hit_"+punches,car.transform);
                        if(punches<5){stage=2;at=Time.time-HulkController.TransformDuration;}else Next();
                    }
                    else if(stage==4&&age>4)
                    {
                        Check(car.Burning,"wreck fire stopped");
                        Capture("sedan_burning_black_smoke",car.transform,1.5f);
                        var damage=new MaterialPropertyBlock();car.GetComponent<Renderer>().GetPropertyBlock(damage);Check(damage.GetFloat("_Destroyed")>.99f,"wreck did not char");
                        bus=UnityEngine.Object.FindObjectsOfType<DestructibleVehicle>().First(c=>c.name=="City bus");
                        Check(bus.Hits==0&&!bus.Smoking&&!bus.Burning,"damage leaked to another vehicle");Next();
                    }
                    else if(stage==5&&age>1.8f)
                    {
                        if(busHits>0)Capture("bus_hit_"+busHits,bus.transform,1.7f);
                        if(busHits==5){nextFrame=Time.time;Next();return;}
                        bus.Punch(bus.transform.TransformPoint(new Vector3(-1.2f,1.1f,2)),bus.transform.right);busHits++;
                        Check(bus.Hits==busHits&&bus.Destroyed==(busHits==5)&&bus.Burning==(busHits==5)&&bus.Smoking==(busHits>=2),"bus stage transition incorrect");
                        at=Time.time;
                    }
                    else if(stage==6)
                    {
                        if(Time.time>=nextFrame&&fireFrames<24){Capture("burn_frame_"+(fireFrames++).ToString("D3"),bus.transform,2);nextFrame=Time.time+.15f;}
                        if(age<6)return;
                        Check(bus.Burning&&bus.GetComponent<Renderer>().enabled,"bus wreck disappeared or extinguished");
                        var ps=bus.GetComponentsInChildren<ParticleSystem>();
                        Check(ps.Count(x=>x.name=="Animated wreck flame")==5,"bus fire not distributed across engine, cabin and windows");
                        Check(ps.Where(x=>x.name.Contains("smoke")).All(x=>x.particleCount>0),"black smoke missing");
                        Check(ps.Where(x=>x.name=="Animated wreck flame").All(x=>x.textureSheetAnimation.enabled&&x.particleCount>0),"flame animation not running");
                        var lights=bus.GetComponentsInChildren<Light>();Check(lights.Length>0&&lights[0].intensity>0,"fire light missing");
                        int count=ps.Length;bus.Punch(bus.transform.position,bus.transform.right);Check(bus.Hits==5&&bus.GetComponentsInChildren<ParticleSystem>().Length==count,"wreck creates duplicate fire");
                        Capture("bus_burning_black_smoke",bus.transform,2);
                        Debug.Log("[Vehicle PBR] PASS: actual faster punches hit once; each hit rocks and scars body; smoke starts at two; sedan/bus ignite at five; animated multi-source flames, black smoke, charring and persistent wreck; collider matches hull and untouched vehicles remain clean.");
                        p.enabled=true;stage=99;
                    }
                }
                if(!File.Exists("Logs/autoplay_result.txt")||EditorApplication.isPlayingOrWillChangePlaymode)return;
                SessionState.SetBool(Key,false);EditorApplication.Exit(stage==99&&File.ReadAllText("Logs/autoplay_result.txt").Contains("errors=0")?0:3);
            }
            catch(Exception e){Debug.LogException(e);SessionState.SetBool(Key,false);EditorApplication.Exit(4);}
        }
    }
}
