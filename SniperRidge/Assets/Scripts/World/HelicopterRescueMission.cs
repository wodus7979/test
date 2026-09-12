using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Four defended pickup sites, five survivors each. Clearing and overflying a site extracts it.</summary>
    public sealed class HelicopterRescueMission:MonoBehaviour
    {
        public const int TotalSurvivors=20,SiteCount=4,SurvivorsPerSite=5;
        public const float PickupRadius=58f;
        public int Rescued { get; private set; }
        public int ActiveThreats { get {int count=0;foreach(var site in sites)count+=site.Threats;return count;} }
        public Vector3 NextSite { get {foreach(var site in sites)if(!site.Extracted)return site.transform.position;return transform.position;} }
        public string Status
        {
            get
            {
                foreach(var site in sites)if(!site.Extracted)
                {
                    float distance=HorizontalDistance(site.transform.position,gm.Flight.transform.position);
                    return site.Threats>0 ? "구조 지점 "+(site.Index+1)+" · 경계병 "+site.Threats+"명 · "+Mathf.RoundToInt(distance)+"m"
                        : "구조 준비 완료 · 지점 위로 접근 "+Mathf.RoundToInt(distance)+"m";
                }
                return "동료 20명 구조 완료";
            }
        }
        readonly List<HelicopterRescueSite> sites=new List<HelicopterRescueSite>();
        readonly Dictionary<EnemySoldier,HelicopterRescueSite> assignments=new Dictionary<EnemySoldier,HelicopterRescueSite>();
        GameManager gm;Material uniform,skin,marker;

        public static HelicopterRescueMission Create(GameManager game)
        {
            var mission=new GameObject("Helicopter rescue mission").AddComponent<HelicopterRescueMission>();mission.gm=game;
            mission.uniform=ProceduralAssets.LitMaterial(new Color(.17f,.34f,.46f),.02f);
            mission.skin=ProceduralAssets.LitMaterial(new Color(.58f,.40f,.28f),.01f);
            mission.marker=ProceduralAssets.LitMaterial(new Color(.12f,.75f,.9f),.05f);
            for(int i=0;i<SiteCount;i++)mission.BuildSite(i);
            return mission;
        }
        public static Vector3 Site(BattlefieldMap map,int index)
        {
            float y=TerrainGenerator.FieldElevation;
            if(map==BattlefieldMap.City)
            {
                var points=new[]{new Vector3(-12,y,-61),new Vector3(11,y,-48),new Vector3(-9,y,-25),new Vector3(7,y,0)};
                return points[Mathf.Clamp(index,0,SiteCount-1)];
            }
            float angle=(45f+index*90f)*Mathf.Deg2Rad;
            return HelicopterFlight.Centre(map)+new Vector3(Mathf.Sin(angle)*34f,0,Mathf.Cos(angle)*34f);
        }
        void BuildSite(int index)
        {
            Vector3 centre=OpenPoint(Site(gm.Map,index),0,3f);
            var go=new GameObject("Rescue site "+(index+1));go.transform.SetParent(transform,false);go.transform.position=centre;
            var site=go.AddComponent<HelicopterRescueSite>();site.Configure(index,uniform,skin,marker);sites.Add(site);
            for(int i=0;i<3;i++)
            {
                Vector3 point=OpenPoint(centre,index*3+i+1,12f+i*3f);
                EnemyRole role=i==0?EnemyRole.RocketTrooper:EnemyRole.MachineGunner;
                var enemy=LevelBuilder.SpawnHelicopterEnemy(gm,point,"Rescue_"+(index+1)+"_Guard_"+(i+1),role);
                enemy.SetAware();assignments.Add(enemy,site);site.Threats++;
            }
        }
        Vector3 OpenPoint(Vector3 centre,int seed,float radius)
        {
            for(int attempt=0;attempt<18;attempt++)
            {
                float angle=(seed*97+attempt*137.5f)*Mathf.Deg2Rad;
                float r=attempt==0?0:radius+(attempt%3)*2f;
                Vector3 point=centre+new Vector3(Mathf.Sin(angle)*r,0,Mathf.Cos(angle)*r);
                point.y=TerrainGenerator.GroundHeight(gm.Terrain,point.x,point.z);
                if(!Physics.CheckCapsule(point+Vector3.up*.35f,point+Vector3.up*2.4f,.55f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))return point;
            }
            centre.y=TerrainGenerator.GroundHeight(gm.Terrain,centre.x,centre.z);return centre;
        }
        void Update()
        {
            if(gm==null||!gm.IsPlaying||gm.Flight==null)return;
            foreach(var site in sites)
            {
                if(site.Extracted||site.Threats>0)continue;
                if(HorizontalDistance(site.transform.position,gm.Flight.transform.position)>PickupRadius)continue;
                site.Extract();Rescued+=SurvivorsPerSite;gm.AddScore(1000);
                gm.Hud.Announce("동료 "+Rescued+" / "+TotalSurvivors+" 구조 · 다음 지점으로 이동");
                if(Rescued>=TotalSurvivors){gm.Hud.Announce("동료 20명 전원 구조 완료");gm.CompleteHelicopterMission();}
                break;
            }
        }
        public void OnEnemyKilled(EnemySoldier enemy)
        {
            if(enemy==null||!assignments.TryGetValue(enemy,out var site))return;
            assignments.Remove(enemy);site.Threats=Mathf.Max(0,site.Threats-1);
            if(site.Threats==0)gm.Hud.Announce("구조 지점 "+(site.Index+1)+" 안전 확보 · 헬기가 접근합니다");
        }
        static float HorizontalDistance(Vector3 a,Vector3 b){a.y=b.y=0;return Vector3.Distance(a,b);}
        void OnDestroy(){if(uniform!=null)Destroy(uniform);if(skin!=null)Destroy(skin);if(marker!=null)Destroy(marker);}
    }

    public sealed class HelicopterRescueSite:MonoBehaviour
    {
        public int Index { get; private set; }
        public int Threats { get; set; }
        public bool Extracted { get; private set; }
        readonly List<RescueSurvivor> survivors=new List<RescueSurvivor>();LineRenderer beacon;
        public void Configure(int index,Material uniform,Material skin,Material marker)
        {
            Index=index;
            Vector3[] offsets={new Vector3(-1.8f,0,-1),new Vector3(0,0,-1.5f),new Vector3(1.8f,0,-1),new Vector3(-.9f,0,1.2f),new Vector3(.9f,0,1.2f)};
            for(int i=0;i<offsets.Length;i++)survivors.Add(RescueSurvivor.Create(transform,offsets[i],uniform,skin,i));
            var pole=new GameObject("Blue rescue beacon");pole.transform.SetParent(transform,false);
            beacon=pole.AddComponent<LineRenderer>();beacon.positionCount=2;beacon.useWorldSpace=false;
            beacon.SetPosition(0,Vector3.up*.2f);beacon.SetPosition(1,Vector3.up*18f);beacon.startWidth=.15f;beacon.endWidth=.035f;
            beacon.sharedMaterial=Effects.Unlit(new Color(.15f,.8f,1f,.85f));beacon.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
            var pad=GameObject.CreatePrimitive(PrimitiveType.Cylinder);pad.name="Rescue marking";pad.transform.SetParent(transform,false);
            pad.transform.localPosition=Vector3.up*.025f;pad.transform.localScale=new Vector3(3.2f,.025f,3.2f);pad.GetComponent<Renderer>().sharedMaterial=marker;
            Destroy(pad.GetComponent<Collider>());
        }
        public void Extract()
        {
            if(Extracted)return;Extracted=true;beacon.startColor=beacon.endColor=new Color(.25f,1f,.35f,.9f);
            foreach(var survivor in survivors)if(survivor!=null)survivor.Extract();
        }
    }

    public sealed class RescueSurvivor:MonoBehaviour
    {
        Transform arm;float phase,extractAt=-1;
        public static RescueSurvivor Create(Transform parent,Vector3 position,Material uniform,Material skin,int index)
        {
            var root=new GameObject("Survivor "+(index+1));root.transform.SetParent(parent,false);root.transform.localPosition=position;
            var survivor=root.AddComponent<RescueSurvivor>();survivor.phase=index*1.17f;
            Part(root.transform,"Torso",PrimitiveType.Capsule,new Vector3(0,1.05f,0),new Vector3(.48f,.43f,.35f),uniform);
            Part(root.transform,"Head",PrimitiveType.Sphere,new Vector3(0,1.72f,0),Vector3.one*.30f,skin);
            foreach(int side in new[]{-1,1})Part(root.transform,"Leg",PrimitiveType.Capsule,new Vector3(.13f*side,.40f,0),new Vector3(.22f,.40f,.22f),uniform);
            Part(root.transform,"Arm",PrimitiveType.Capsule,new Vector3(-.29f,1.2f,0),new Vector3(.13f,.33f,.13f),uniform);
            survivor.arm=Part(root.transform,"Waving arm",PrimitiveType.Capsule,new Vector3(.32f,1.43f,0),new Vector3(.13f,.36f,.13f),uniform).transform;
            return survivor;
        }
        static GameObject Part(Transform parent,string name,PrimitiveType type,Vector3 position,Vector3 scale,Material material)
        {
            var go=GameObject.CreatePrimitive(type);go.name=name;go.transform.SetParent(parent,false);go.transform.localPosition=position;go.transform.localScale=scale;
            go.GetComponent<Renderer>().sharedMaterial=material;Object.Destroy(go.GetComponent<Collider>());return go;
        }
        public void Extract(){extractAt=Time.time;}
        void Update()
        {
            arm.localRotation=Quaternion.Euler(0,0,-35f+Mathf.Sin(Time.time*5f+phase)*35f);
            if(extractAt<0)return;
            float t=(Time.time-extractAt)/1.8f;transform.localPosition+=Vector3.up*Time.deltaTime*8f;
            transform.localScale=Vector3.one*Mathf.Clamp01(1-t);if(t>=1)Destroy(gameObject);
        }
    }
}
