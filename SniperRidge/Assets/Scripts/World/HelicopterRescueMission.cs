using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Four defended rooftop landing zones, five survivors each.</summary>
    public sealed class HelicopterRescueMission:MonoBehaviour
    {
        public const int TotalSurvivors=20,SiteCount=4,SurvivorsPerSite=5,GuardsPerSite=4;
        public const float BoardingSeconds=6f;
        public int Rescued { get; private set; }
        public int ActiveThreats { get {int count=0;foreach(var site in sites)count+=site.Threats;return count;} }
        public Vector3 NextSite { get {foreach(var site in sites)if(!site.Extracted)return site.transform.position;return transform.position;} }
        public float BoardingProgress { get; private set; }
        public string Status
        {
            get
            {
                foreach(var site in sites)if(!site.Extracted)
                {
                    float distance=HorizontalDistance(site.transform.position,gm.Flight.transform.position);
                    if(site.Threats>0)return "옥상 "+(site.Index+1)+" · 경계병 "+site.Threats+"명 · "+Mathf.RoundToInt(distance)+"m";
                    if(site.Boarding)return "옥상 착륙 · 동료 탑승 "+Mathf.RoundToInt(BoardingProgress*100f)+"%";
                    if(gm.Flight.IsApproachingPad)return "옥상 착륙 접근 · "+Mathf.RoundToInt(distance)+"m";
                    return "옥상 안전 확보 · 착륙 준비";
                }
                return "동료 20명 구조 완료";
            }
        }
        readonly List<HelicopterRescueSite> sites=new List<HelicopterRescueSite>();
        readonly Dictionary<EnemySoldier,HelicopterRescueSite> assignments=new Dictionary<EnemySoldier,HelicopterRescueSite>();
        GameManager gm;Material uniform,skin,marker;float boardingStarted;

        public static HelicopterRescueMission Create(GameManager game)
        {
            var mission=new GameObject("Helicopter rooftop rescue mission").AddComponent<HelicopterRescueMission>();mission.gm=game;
            mission.uniform=SurfaceDetail.Make(Surface.Fabric,new Color(.17f,.34f,.46f),.02f);
            mission.skin=SurfaceDetail.Make(Surface.Skin,new Color(.58f,.40f,.28f),.25f);
            mission.marker=ProceduralAssets.LitMaterial(new Color(.12f,.75f,.9f),.05f);
            for(int i=0;i<SiteCount;i++)mission.BuildSite(i);
            return mission;
        }
        public static Vector3 Site(BattlefieldMap map,int index)
        {
            if(map==BattlefieldMap.City)
            {
                float roof=CityLayout.BaseY+20.4f+.12f;
                var rooftops=new[]{new Vector3(-104,roof,-104),new Vector3(100,roof,-75),new Vector3(-105,roof,55),new Vector3(98,roof,92)};
                return rooftops[Mathf.Clamp(index,0,SiteCount-1)];
            }
            float angle=(45f+index*90f)*Mathf.Deg2Rad;
            Vector3 point=HelicopterFlight.Centre(map)+new Vector3(Mathf.Sin(angle)*82f,0,Mathf.Cos(angle)*82f);
            point.y=TerrainGenerator.FieldElevation+.12f;return point;
        }
        void BuildSite(int index)
        {
            Vector3 centre=Site(gm.Map,index);
            if(gm.Map!=BattlefieldMap.City)centre=OpenPoint(centre,0,3f);
            var go=new GameObject("Rooftop rescue site "+(index+1));go.transform.SetParent(transform,false);go.transform.position=centre;
            var site=go.AddComponent<HelicopterRescueSite>();site.Configure(index,uniform,skin,marker);sites.Add(site);
            Vector3[] offsets={new Vector3(-6.6f,0,-3.8f),new Vector3(6.6f,0,-3.8f),new Vector3(-6.6f,0,3.8f),new Vector3(6.6f,0,3.8f)};
            for(int i=0;i<GuardsPerSite;i++)
            {
                Vector3 point=centre+offsets[i];
                if(gm.Map!=BattlefieldMap.City)point=OpenPoint(centre,index*5+i+1,12f+i*3f);
                EnemyRole role=i==0?EnemyRole.RocketTrooper:EnemyRole.MachineGunner;
                float fixedSurface=gm.Map==BattlefieldMap.City?centre.y:float.NaN;
                var enemy=LevelBuilder.SpawnHelicopterEnemy(gm,point,"Rooftop_"+(index+1)+"_Guard_"+(i+1),role,fixedSurface);
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
                if(site.Extracted)continue;
                if(site.Threats>0)break;
                gm.Flight.RequestLanding(site.transform.position);
                if(!gm.Flight.IsOnPad)break;
                if(!site.Boarding)
                {
                    site.BeginBoarding(gm.Flight.GunnerStation);boardingStarted=Time.time;BoardingProgress=0;
                    gm.Hud.Announce("옥상 착륙 완료 · 동료 5명 탑승 중");
                }
                BoardingProgress=Mathf.Clamp01((Time.time-boardingStarted)/BoardingSeconds);
                if(BoardingProgress<1f)break;
                site.Extract();Rescued+=SurvivorsPerSite;gm.AddScore(1000);gm.Flight.DepartPad();BoardingProgress=0;
                gm.Hud.Announce("동료 "+Rescued+" / "+TotalSurvivors+" 구조 · 옥상에서 이륙");
                if(Rescued>=TotalSurvivors){gm.Hud.Announce("동료 20명 전원 구조 완료");gm.CompleteHelicopterMission();}
                break;
            }
        }
        public void OnEnemyKilled(EnemySoldier enemy)
        {
            if(enemy==null||!assignments.TryGetValue(enemy,out var site))return;
            assignments.Remove(enemy);site.Threats=Mathf.Max(0,site.Threats-1);
            if(site.Threats==0)gm.Hud.Announce("옥상 "+(site.Index+1)+" 안전 확보 · 착륙을 시작합니다");
        }
        static float HorizontalDistance(Vector3 a,Vector3 b){a.y=b.y=0;return Vector3.Distance(a,b);}
        void OnDestroy(){if(uniform!=null)Destroy(uniform);if(skin!=null)Destroy(skin);if(marker!=null)Destroy(marker);}
    }

    public sealed class HelicopterRescueSite:MonoBehaviour
    {
        public int Index { get; private set; }
        public int Threats { get; set; }
        public bool Extracted { get; private set; }
        public bool Boarding { get; private set; }
        readonly List<RescueSurvivor> survivors=new List<RescueSurvivor>();LineRenderer beacon;
        public void Configure(int index,Material uniform,Material skin,Material marker)
        {
            Index=index;
            Vector3[] offsets={new Vector3(-3.8f,.08f,-2.8f),new Vector3(-2.2f,.08f,-3.8f),new Vector3(0,.08f,-4.2f),new Vector3(2.2f,.08f,-3.8f),new Vector3(3.8f,.08f,-2.8f)};
            for(int i=0;i<offsets.Length;i++)survivors.Add(RescueSurvivor.Create(transform,offsets[i],uniform,skin,i));
            var pole=new GameObject("Blue rooftop beacon");pole.transform.SetParent(transform,false);
            beacon=pole.AddComponent<LineRenderer>();beacon.positionCount=2;beacon.useWorldSpace=false;
            beacon.SetPosition(0,Vector3.up*.2f);beacon.SetPosition(1,Vector3.up*24f);beacon.startWidth=.22f;beacon.endWidth=.05f;
            beacon.sharedMaterial=Effects.Unlit(new Color(.15f,.8f,1f,.85f));beacon.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
            var pad=GameObject.CreatePrimitive(PrimitiveType.Cylinder);pad.name="Rooftop helipad H";pad.transform.SetParent(transform,false);
            pad.transform.localPosition=Vector3.up*.025f;pad.transform.localScale=new Vector3(10.5f,.035f,10.5f);pad.GetComponent<Renderer>().sharedMaterial=marker;
            Destroy(pad.GetComponent<Collider>());
            for(int i=0;i<8;i++)
            {
                float a=i*Mathf.PI*.25f;var lamp=GameObject.CreatePrimitive(PrimitiveType.Sphere);lamp.name="Helipad perimeter light";
                lamp.transform.SetParent(transform,false);lamp.transform.localPosition=new Vector3(Mathf.Sin(a)*5.2f,.18f,Mathf.Cos(a)*5.2f);
                lamp.transform.localScale=Vector3.one*.18f;lamp.GetComponent<Renderer>().sharedMaterial=marker;Destroy(lamp.GetComponent<Collider>());
            }
        }
        public void BeginBoarding(Transform door)
        {
            if(Boarding)return;Boarding=true;beacon.startColor=beacon.endColor=new Color(.3f,1f,.4f,.9f);
            for(int i=0;i<survivors.Count;i++)if(survivors[i]!=null)survivors[i].BeginBoarding(door,i*.45f);
        }
        public void Extract(){if(Extracted)return;Extracted=true;Boarding=false;beacon.gameObject.SetActive(false);}
    }

    public sealed class RescueSurvivor:MonoBehaviour
    {
        Transform arm,door;float phase,boardAt=-1,delay;Vector3 boardStart;
        public static RescueSurvivor Create(Transform parent,Vector3 position,Material uniform,Material skin,int index)
        {
            var root=new GameObject("Survivor "+(index+1));root.transform.SetParent(parent,false);root.transform.localPosition=position;
            root.transform.localScale=Vector3.one*1.15f;
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
        public void BeginBoarding(Transform helicopterDoor,float startDelay)
        {door=helicopterDoor;delay=startDelay;boardAt=Time.time;boardStart=transform.position;transform.SetParent(null,true);}
        void Update()
        {
            if(boardAt<0)
            {
                arm.localRotation=Quaternion.Euler(0,0,-35f+Mathf.Sin(Time.time*5f+phase)*35f);return;
            }
            float t=Mathf.Clamp01((Time.time-boardAt-delay)/3.2f);if(t<=0)return;
            Vector3 destination=door!=null?door.TransformPoint(new Vector3(.35f,-.05f,-.15f)):boardStart+Vector3.up*2f;
            Vector3 flat=destination-transform.position;flat.y=0;if(flat.sqrMagnitude>.02f)transform.rotation=Quaternion.Slerp(transform.rotation,Quaternion.LookRotation(flat),Time.deltaTime*8f);
            transform.position=Vector3.Lerp(boardStart,destination,Mathf.SmoothStep(0,1,t));
            if(t>.82f)transform.localScale=Vector3.one*1.15f*(1-Mathf.InverseLerp(.82f,1f,t));
            if(t>=1)Destroy(gameObject);
        }
    }
}
