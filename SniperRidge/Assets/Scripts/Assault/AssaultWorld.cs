using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    public sealed class AssaultWorld:MonoBehaviour
    {
        NavMeshData data;
        NavMeshDataInstance navigation;
        TerrainData terrainData;
        TerrainLayer surface;
        readonly List<GameObject> blocks=new List<GameObject>();
        readonly List<Renderer[]> blockRenderers=new List<Renderer[]>();
        Transform player;
        float nextVisibility;
        public static AssaultWorld Build(GameManager gm)
        {
            var world=new GameObject("Urban FPS district").AddComponent<AssaultWorld>();
            world.player=gm.Player.transform;
            try { world.Construct(gm); }
            catch { world.enabled=false;throw; }
            return world;
        }
        void Construct(GameManager gm)
        {
            terrainData=new TerrainData{heightmapResolution=129,size=new Vector3(AssaultLayout.Size,40,AssaultLayout.Size)};
            var heights=new float[129,129];for(int z=0;z<129;z++)for(int x=0;x<129;x++)heights[z,x]=AssaultLayout.Ground/40f;
            terrainData.SetHeights(0,0,heights);
            surface=new TerrainLayer{diffuseTexture=Resources.Load<Texture2D>("CityPack/Textures/asphalt_albedo"),
                normalMapTexture=Resources.Load<Texture2D>("CityPack/Textures/asphalt_normal_unity"),normalScale=.15f,smoothness=0,metallic=0,tileSize=new Vector2(4,4)};
            terrainData.terrainLayers=new[]{surface};terrainData.alphamapResolution=128;
            var alpha=new float[128,128,1];for(int z=0;z<128;z++)for(int x=0;x<128;x++)alpha[z,x,0]=1;
            terrainData.SetAlphamaps(0,0,alpha);
            var ground=Terrain.CreateTerrainGameObject(terrainData);ground.transform.SetParent(transform);
            ground.transform.position=new Vector3(-600,0,-600);
            var old=gm.Terrain;old.gameObject.SetActive(false);Destroy(old.terrainData);Destroy(old.gameObject);
            gm.Terrain=ground.GetComponent<Terrain>();gm.Terrain.drawInstanced=true;gm.Terrain.basemapDistance=1500;
            string[] types={"retail_row","warehouse","office_midrise","auto_workshop","apartment_slab","office_tower"};
            // 120 m city grid, 192 buildings with cross streets, courtyards and enterable shops/workshops.
            int index=0;
            for(int z=-420;z<=420;z+=120)for(int x=-300;x<=300;x+=120)
            {
                var block=new GameObject("District block "+index).transform;block.SetParent(transform,false);block.position=new Vector3(x,12,z);blocks.Add(block.gameObject);
                for(int i=0;i<4;i++)
                {
                    string type=types[(index+i*2)%types.Length];
                    Place(type,block,new Vector3(x+(i%2==0?-25:25),12.04f,z+(i<2?-24:24)),i%2==0?90:-90);
                }
                for(int side=-1;side<=1;side+=2)
                {
                    UrbanProps.Place((index%3==0?"Utility van":"Abandoned sedan"),block,new Vector3(x+side*50,12.18f,z+9),index%2==0?8:172);
                    UrbanProps.Place("Utility cabinet",block,new Vector3(x+side*47,12.2f,z-17),side*90);
                    UrbanProps.Place("Street dumpster",block,new Vector3(x+side*42,12.2f,z+28),side*90);
                    Place("street_lamp",block,new Vector3(x+side*51,12,z-42),0);
                    Place("pallet_crates",block,new Vector3(x+side*39,12,z-41),0);
                }
                index++;
            }
            // Sidewalk curbs and lane markings are solid, dry and aligned with the navigable street grid.
            var sidewalk=Resources.Load<Material>("CityPack/Materials/Sidewalk");
            var white=Resources.Load<Material>("CityPack/Materials/White_Paint");
            for(int x=-360;x<=360;x+=120)
            {
                foreach(int side in new[]{-1,1})Box("Pavement curb",new Vector3(x+side*14,12.09f,0),new Vector3(5,.18f,1030),sidewalk);
                for(int z=-510;z<515;z+=9)Box("Lane paint",new Vector3(x,12.008f,z),new Vector3(.12f,.012f,3),white,false);
            }
            for(int z=-480;z<=480;z+=120)
                for(int x=-410;x<=410;x+=9)Box("Cross street paint",new Vector3(x,12.009f,z),new Vector3(3,.012f,.12f),white,false);
            for(int sector=0;sector<AssaultLayout.Objectives.Length;sector++)
            {
                var centre=AssaultLayout.Objectives[sector];
                for(int slot=0;slot<4;slot++)
                {
                    var p=AssaultLayout.CoverPost(sector,slot);var front=(centre-p).normalized;
                    UrbanProps.Place("Sandbag corner",transform,p+front*1.5f,Quaternion.LookRotation(front).eulerAngles.y);
                }
                Place("concrete_barrier",transform,centre+new Vector3(-4,0,-7),90);
                Place("concrete_barrier",transform,centre+new Vector3(4,0,7),90);
                UrbanProps.Place("Utility cabinet",transform,centre+Vector3.right*10,90);
                for(int t=0;t<2;t++)Vegetation.Tree(transform,centre+new Vector3(t==0?-20:20,0,48),.6f,Vegetation.TreeType.Broadleaf,new System.Random(sector*19+t));
            }
            var concrete=Resources.Load<Material>("CityPack/Materials/Concrete");
            Box("District west boundary",new Vector3(-445,15,0),new Vector3(2,6,1090),concrete);
            Box("District east boundary",new Vector3(445,15,0),new Vector3(2,6,1090),concrete);
            Box("District south boundary",new Vector3(0,15,-545),new Vector3(890,6,2),concrete);
            Box("District north boundary",new Vector3(0,15,545),new Vector3(890,6,2),concrete);
            Physics.SyncTransforms();BuildNavigation();
            StaticBatchingUtility.Combine(gameObject);
            foreach(var block in blocks)blockRenderers.Add(block.GetComponentsInChildren<Renderer>());
            var post=gm.PlayerEye.GetComponent<PostEffect>();post.Exposure=1.03f;post.Contrast=1.07f;post.Saturation=.88f;post.BloomIntensity=.1f;post.Vignette=.1f;
            QualitySettings.shadowDistance=180;QualitySettings.lodBias=1.6f;
            RenderSettings.fogDensity=.0011f;RenderSettings.reflectionIntensity=.30f;
        }
        void BuildNavigation()
        {
            if(NavMesh.GetSettingsCount()==0)throw new InvalidOperationException("NavMesh agent settings missing");
            var settings=NavMesh.GetSettingsByIndex(0);settings.agentRadius=.42f;settings.agentHeight=1.9f;settings.agentClimb=.3f;
            settings.overrideVoxelSize=true;settings.voxelSize=.2f;
            var sources=new List<NavMeshBuildSource>();
            NavMeshBuilder.CollectSources(transform,EnemyRagdoll.CombatMask,NavMeshCollectGeometry.PhysicsColliders,0,new List<NavMeshBuildMarkup>(),sources);
            data=NavMeshBuilder.BuildNavMeshData(settings,sources,new Bounds(new Vector3(0,25,0),new Vector3(920,70,1120)),Vector3.zero,Quaternion.identity);
            if(data==null)throw new InvalidOperationException("도시 이동 경로 생성 실패");
            navigation=NavMesh.AddNavMeshData(data);
            ValidateNavigation();
        }
        // Run against the actual baked geometry, also available to the Play-mode validation menu.
        public static void ValidateNavigation()
        {
            Vector3 previous=AssaultLayout.Start;
            for(int sector=0;sector<AssaultLayout.Objectives.Length;sector++)
            {
                var objective=AssaultLayout.Objectives[sector];
                RequireRoute(previous,objective);previous=objective;
                for(int slot=0;slot<4;slot++)RequireRoute(AssaultLayout.CoverPost(sector,slot),objective);
                for(int wave=0;wave<AssaultLayout.Waves;wave++)
                    for(int slot=0;slot<3;slot++)RequireRoute(AssaultLayout.Entry(sector,wave,slot),objective);
            }
        }
        static void RequireRoute(Vector3 from,Vector3 to)
        {
            var route=new NavMeshPath();
            if(!NavMesh.SamplePosition(from,out var start,3,NavMesh.AllAreas) ||
                !NavMesh.SamplePosition(to,out var finish,3,NavMesh.AllAreas) ||
                !NavMesh.CalculatePath(start.position,finish.position,NavMesh.AllAreas,route) || route.status!=NavMeshPathStatus.PathComplete)
                throw new InvalidOperationException("도시 도보/증원 경로가 끊겼습니다: "+from+" → "+to);
        }
        public static GameObject Place(string name,Transform parent,Vector3 p,float yaw)
        {
            var prefab=Resources.Load<GameObject>("CityPack/Prefabs/"+name);
            if(prefab==null)throw new InvalidOperationException("도시 에셋 누락: "+name);
            return Instantiate(prefab,p,Quaternion.Euler(0,yaw,0),parent);
        }
        void Box(string name,Vector3 p,Vector3 size,Material material,bool solid=true)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=name;go.transform.SetParent(transform,true);go.transform.position=p;go.transform.localScale=size;
            go.GetComponent<Renderer>().sharedMaterial=material;
            if(!solid){go.GetComponent<Collider>().enabled=false;Destroy(go.GetComponent<Collider>());}
        }
        void Update()
        {
            if(player==null||Time.time<nextVisibility)return;nextVisibility=Time.time+.8f;
            // Hide only renderers, retaining distant solid geometry and navigation.
            for(int i=0;i<blocks.Count;i++)
            {
                bool visible=(player.position-blocks[i].transform.position).sqrMagnitude<420f*420f;
                foreach(var renderer in blockRenderers[i])renderer.enabled=visible;
            }
        }
        void OnDestroy()
        {
            if(navigation.valid)navigation.Remove();if(data!=null)Destroy(data);
            if(terrainData!=null)Destroy(terrainData);if(surface!=null)Destroy(surface);
        }
    }
}
