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
        TerrainLayer courtyard;
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
            surface=new TerrainLayer{diffuseTexture=Resources.Load<Texture2D>("CityPack/Textures/asphalt_urban"),
                normalMapTexture=Resources.Load<Texture2D>("CityPack/Textures/asphalt_normal_unity"),normalScale=.08f,smoothness=0,metallic=0,specular=Color.black,tileSize=new Vector2(2,2)};
            courtyard=new TerrainLayer{diffuseTexture=Resources.Load<Texture2D>("Terrain/forest_albedo"),normalMapTexture=Resources.Load<Texture2D>("Terrain/forest_normal"),normalScale=.18f,smoothness=0,metallic=0,tileSize=new Vector2(5,5)};
            terrainData.terrainLayers=new[]{surface,courtyard};terrainData.alphamapResolution=128;
            var alpha=new float[128,128,2];
            for(int z=0;z<128;z++)for(int x=0;x<128;x++)
            {
                var p=new Vector2((x+.5f)/128*AssaultLayout.Size-AssaultLayout.Size*.5f,(z+.5f)/128*AssaultLayout.Size-AssaultLayout.Size*.5f);
                float green=0;
                if(AssaultLayout.Data.greenery!=null)foreach(var tree in AssaultLayout.Data.greenery)
                    green=Mathf.Max(green,1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(1.5f,5f,Vector2.Distance(p,new Vector2(tree.x,tree.z)))));
                alpha[z,x,0]=1-green;alpha[z,x,1]=green;
            }
            terrainData.SetAlphamaps(0,0,alpha);
            var ground=Terrain.CreateTerrainGameObject(terrainData);ground.transform.SetParent(transform);
            ground.transform.position=new Vector3(-AssaultLayout.Size*.5f,0,-AssaultLayout.Size*.5f);
            var old=gm.Terrain;old.gameObject.SetActive(false);Destroy(old.terrainData);Destroy(old.gameObject);
            gm.Terrain=ground.GetComponent<Terrain>();gm.Terrain.materialTemplate=Resources.Load<Material>("CityPack/Materials/DryTerrain");gm.Terrain.drawInstanced=true;gm.Terrain.basemapDistance=1500;
            // Asset sizes stay life-size; the authored blocks now sit much closer together.
            foreach(var item in AssaultLayout.Data.buildings)
            {
                var block=Place(item.asset,transform,item.WorldPosition,item.yaw);blocks.Add(block);
                UrbanStreetDetails.VaryFacade(block,blocks.Count);
            }
            foreach(var item in AssaultLayout.Data.props)
            {
                if(item.original)UrbanProps.Place(item.asset,transform,item.WorldPosition,item.yaw);
                else {var prop=Place(item.asset,transform,item.WorldPosition,item.yaw);if(item.asset.StartsWith("town_"))UrbanStreetDetails.VaryFacade(prop,0);}
            }
            var sidewalk=Resources.Load<Material>("CityPack/Materials/Sidewalk");
            var white=Resources.Load<Material>("CityPack/Materials/White_Paint");
            for(int x=-144;x<=144;x+=72)
            {
                foreach(int side in new[]{-1,1})Box("Pavement curb",new Vector3(x+side*4.8f,12.09f,0),new Vector3(1.6f,.18f,300),sidewalk);
                for(int z=-144;z<=144;z+=9)Box("Lane paint",new Vector3(x,12.008f,z),new Vector3(.10f,.012f,2.6f),white,false);
            }
            for(int z=-144;z<=144;z+=72)
                for(int x=-144;x<=144;x+=9)Box("Cross street paint",new Vector3(x,12.009f,z),new Vector3(2.6f,.012f,.1f),white,false);
            for(int sector=0;sector<AssaultLayout.Objectives.Length;sector++)
            {
                var centre=AssaultLayout.Objectives[sector];
                for(int slot=0;slot<4;slot++)
                {
                    var p=AssaultLayout.CoverPost(sector,slot);var front=(centre-p).normalized;
                    var cover=UrbanProps.Place("Sandbag corner",transform,p+front*1.5f,Quaternion.LookRotation(front).eulerAngles.y);
                    cover.transform.localScale=new Vector3(1,1.5f/1.14f,1);
                }
                Place("concrete_barrier",transform,centre+new Vector3(-3,0,-6),90);
                Place("concrete_barrier",transform,centre+new Vector3(3,0,6),90);
                UrbanProps.Place("Utility cabinet",transform,centre+Vector3.right*4.2f,90);
            }
            var concrete=Resources.Load<Material>("CityPack/Materials/Concrete");
            float boundary=AssaultLayout.BoundaryX;
            Box("District west boundary",new Vector3(-boundary,15,0),new Vector3(2,6,boundary*2),concrete);
            Box("District east boundary",new Vector3(boundary,15,0),new Vector3(2,6,boundary*2),concrete);
            Box("District south boundary",new Vector3(0,15,-boundary),new Vector3(boundary*2,6,2),concrete);
            Box("District north boundary",new Vector3(0,15,boundary),new Vector3(boundary*2,6,2),concrete);
            UrbanStreetDetails.Build(transform);
            foreach(var block in blocks)blockRenderers.Add(block.GetComponentsInChildren<Renderer>());
            QualitySettings.shadowDistance=180;QualitySettings.lodBias=1.6f;
            MilitaryTownEnvironment.Build(transform,gm);
            Physics.SyncTransforms();BuildNavigation();
            var batch=new List<GameObject>();
            foreach(var renderer in GetComponentsInChildren<MeshRenderer>())
                if(renderer.GetComponentInParent<LODGroup>()==null && renderer.GetComponent<MeshFilter>()!=null)batch.Add(renderer.gameObject);
            StaticBatchingUtility.Combine(batch.ToArray(),gameObject);
        }
        void BuildNavigation()
        {
            if(NavMesh.GetSettingsCount()==0)throw new InvalidOperationException("NavMesh agent settings missing");
            var settings=NavMesh.GetSettingsByIndex(0);settings.agentRadius=.5f;settings.agentHeight=2.5f;settings.agentClimb=.3f;
            settings.overrideVoxelSize=true;settings.voxelSize=.2f;
            var sources=new List<NavMeshBuildSource>();
            NavMeshBuilder.CollectSources(transform,EnemyRagdoll.CombatMask,NavMeshCollectGeometry.PhysicsColliders,0,new List<NavMeshBuildMarkup>(),sources);
            data=NavMeshBuilder.BuildNavMeshData(settings,sources,new Bounds(new Vector3(0,25,0),new Vector3(AssaultLayout.Size,70,AssaultLayout.Size)),Vector3.zero,Quaternion.identity);
            if(data==null)throw new InvalidOperationException("도시 이동 경로 생성 실패");
            navigation=NavMesh.AddNavMeshData(data);
            ValidateNavigation();
        }
        // Run against the actual baked geometry, also available to the Play-mode validation menu.
        public static void ValidateNavigation()
        {
            RequireRoute(AssaultLayout.Start,AssaultLayout.BossPosition);
            Vector3 previous=AssaultLayout.Start;
            for(int sector=0;sector<AssaultLayout.Objectives.Length;sector++)
            {
                var objective=AssaultLayout.Objectives[sector];
                RequireRoute(previous,objective);previous=objective;
                for(int slot=0;slot<4;slot++)RequireRoute(AssaultLayout.CoverPost(sector,slot),objective);
                for(int slot=0;slot<12;slot++)RequireRoute(AssaultLayout.ApproachSample(sector,slot),objective);
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
            if(name=="Pavement curb")
            {
                var filter=go.GetComponent<MeshFilter>();var mesh=Instantiate(filter.sharedMesh);mesh.name="Pavement with metre UVs";
                var uv=mesh.uv;var vertices=mesh.vertices;var normals=mesh.normals;
                for(int i=0;i<uv.Length;i++)
                {
                    Vector3 v=Vector3.Scale(vertices[i],size);
                    uv[i]=Mathf.Abs(normals[i].y)>.5f?new Vector2(v.x,v.z)/3f:Mathf.Abs(normals[i].z)>.5f?new Vector2(v.x,v.y)/3f:new Vector2(v.z,v.y)/3f;
                }
                mesh.uv=uv;filter.sharedMesh=mesh;go.AddComponent<UrbanMeshOwner>().Mesh=mesh;
            }
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
            if(terrainData!=null)Destroy(terrainData);if(surface!=null)Destroy(surface);if(courtyard!=null)Destroy(courtyard);
        }
    }
}
