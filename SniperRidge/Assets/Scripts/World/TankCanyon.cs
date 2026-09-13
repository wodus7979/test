using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>Low autumn hills with open cross-country driving and connected fallback roads.</summary>
    public static class TankCanyon
    {
        public const float CombatBounds=100f, EnemyScale=1.3f;
        public const int NodeCount=16, EntryNode=1, EntryExitNode=5;
        static readonly float[] RowOffsets={-4f,5f,-5f,3f};
        static readonly float[] ColumnOffsets={-5f,4f,-3f,6f};
        static readonly int[] ClosedLinks={};
        static readonly List<Vector3> Obstacles=new List<Vector3>(); // X/Z centre and horizontal radius.
        struct RoadSegment { public Vector2 Start,Delta; public float InverseLengthSquared; }
        static readonly RoadSegment[] RoadSegments=MakeSegments();
        public static Vector2 Node(int i)=>new Vector2(-60f+(i%4)*40f+RowOffsets[i/4],-60f+(i/4)*40f+ColumnOffsets[i%4]);
        public static Vector3 EntryDirection
        {
            get { Vector2 d=Node(EntryExitNode)-Node(EntryNode);return new Vector3(d.x,0,d.y).normalized; }
        }
        public static bool Linked(int a,int b)
        {
            int key=Mathf.Min(a,b)*NodeCount+Mathf.Max(a,b);
            foreach(int closed in ClosedLinks)if(key==closed)return false;
            return a/4==b/4&&Mathf.Abs(a-b)==1||a%4==b%4&&Mathf.Abs(a-b)==4;
        }
        static RoadSegment[] MakeSegments()
        {
            var segments=new List<RoadSegment>();
            for(int a=0;a<NodeCount;a++)for(int b=a+1;b<NodeCount;b++)if(Linked(a,b))
            {
                Vector2 delta=Node(b)-Node(a);
                segments.Add(new RoadSegment{Start=Node(a),Delta=delta,InverseLengthSquared=1f/delta.sqrMagnitude});
            }
            return segments.ToArray();
        }
        public static float RoadDistance(float x,float z)
        {
            var p=new Vector2(x,z);float squared=float.MaxValue;
            foreach(var segment in RoadSegments)
            {
                Vector2 relative=p-segment.Start;
                float t=Mathf.Clamp01(Vector2.Dot(relative,segment.Delta)*segment.InverseLengthSquared);
                squared=Mathf.Min(squared,(relative-segment.Delta*t).sqrMagnitude);
            }
            return Mathf.Sqrt(squared);
        }
        public static float Height(float x,float z)
        {
            float floor=12f+1.5f*Mathf.Sin(z*.024f)+1.2f*Mathf.Sin(x*.03f);
            float hill=.7f*Mathf.Sin((x+z)*.028f);
            float outer=Mathf.SmoothStep(0,1,Mathf.InverseLerp(125,220,Mathf.Max(Mathf.Abs(x),Mathf.Abs(z))));
            return floor+hill+outer*4f;
        }
        public static Vector3 Ground(Terrain terrain,Vector2 p,float lift=.12f)=>TerrainGenerator.OnGround(terrain,p.x,p.y,lift);
        public static Vector3 Normal(Terrain terrain,Vector3 p)
        {
            Vector3 local=p-terrain.transform.position;Vector3 size=terrain.terrainData.size;
            return terrain.terrainData.GetInterpolatedNormal(Mathf.Clamp01(local.x/size.x),Mathf.Clamp01(local.z/size.z));
        }
        public static int NearestNode(Vector3 p)
        {
            int best=0;float distance=float.MaxValue;
            for(int i=0;i<NodeCount;i++){float d=Vector2.SqrMagnitude(Node(i)-new Vector2(p.x,p.z));if(d<distance){distance=d;best=i;}}
            return best;
        }
        public static Vector3 NextWaypoint(Terrain terrain,Vector3 from,Vector3 target)
        {
            int start=NearestNode(from),goal=NearestNode(target);
            // Rejoin a road junction when a tree or low rock blocks a direct approach.
            if(Vector2.Distance(new Vector2(from.x,from.z),Node(start))>7f)return Ground(terrain,Node(start));
            if(start==goal)return Ground(terrain,Node(goal));
            var parent=new int[NodeCount];for(int i=0;i<NodeCount;i++)parent[i]=-1;
            var queue=new Queue<int>();queue.Enqueue(start);parent[start]=start;
            while(queue.Count>0&&parent[goal]<0)
            {
                int current=queue.Dequeue();
                for(int i=0;i<NodeCount;i++)if(parent[i]<0&&Linked(current,i)){parent[i]=current;queue.Enqueue(i);}
            }
            int next=goal;while(parent[next]!=start&&next!=start)next=parent[next];
            return Ground(terrain,Node(next));
        }
        public static bool ClearRoad(Vector3 from,Vector3 to)
        {
            Vector2 a=new Vector2(from.x,from.z),d=new Vector2(to.x-from.x,to.z-from.z);
            foreach(var obstacle in Obstacles)
            {
                Vector2 centre=new Vector2(obstacle.x,obstacle.y);
                float t=d.sqrMagnitude>.001f?Mathf.Clamp01(Vector2.Dot(centre-a,d)/d.sqrMagnitude):0;
                // Reserve a 6m wide corridor for enlarged enemy tanks, including turns.
                if(Vector2.SqrMagnitude(centre-a-d*t)<(obstacle.z+3f)*(obstacle.z+3f))return false;
            }
            int steps=Mathf.CeilToInt(Vector3.Distance(from,to)/2f);
            for(int i=0;i<=steps;i++)
            {
                var p=Vector3.Lerp(from,to,i/(float)Mathf.Max(1,steps));
                if(Mathf.Abs(p.x)>CombatBounds||Mathf.Abs(p.z)>CombatBounds)return false;
                float dx=(Height(p.x+.5f,p.z)-Height(p.x-.5f,p.z));
                float dz=(Height(p.x,p.z+.5f)-Height(p.x,p.z-.5f));
                if(dx*dx+dz*dz>.07f)return false; // About 15 degrees, independent of road texture.
            }
            return true;
        }
        public static void Build(GameManager gm)
        {
            var terrain=gm.Terrain;var data=terrain.terrainData;
            const int resolution=513,alpha=512,detail=512;
            data.heightmapResolution=resolution;
            var heights=new float[resolution,resolution];
            for(int z=0;z<resolution;z++)for(int x=0;x<resolution;x++)
                heights[z,x]=Height(x/(float)(resolution-1)*600-300,z/(float)(resolution-1)*600-300)/TerrainGenerator.MaxHeight;
            data.SetHeights(0,0,heights);
            // Brown forest litter replaces the green meadow albedo, not just its tint.
            data.terrainLayers=new[]{Layer("forest",new Color(1f,.86f,.67f),3.2f),Layer("rock",new Color(.91f,.87f,.79f),5f),
                Layer("dirt",new Color(1f,.91f,.77f),4f),Layer("forest",new Color(.88f,.72f,.55f),5.5f)};
            data.alphamapResolution=alpha;var weights=new float[alpha,alpha,4];
            for(int z=0;z<alpha;z++)for(int x=0;x<alpha;x++)
            {
                float nx=(x+.5f)/alpha,nz=(z+.5f)/alpha,wx=nx*600-300,wz=nz*600-300;
                float road=RoadDistance(wx,wz),slope=data.GetSteepness(nx,nz);
                float rock=Mathf.InverseLerp(19,42,slope)*.95f;
                float dirt=(1-rock)*(1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(3.5f,9,road)))*.94f;
                float forest=(1-rock-dirt)*Mathf.PerlinNoise(wx*.09f+5,wz*.09f)*.25f;
                weights[z,x,0]=1-rock-dirt-forest;weights[z,x,1]=rock;weights[z,x,2]=dirt;weights[z,x,3]=forest;
            }
            data.SetAlphamaps(0,0,weights);
            var prototypes=data.detailPrototypes;
            if(prototypes.Length>0)
            {
                prototypes[0].minHeight=.25f;prototypes[0].maxHeight=.65f;
                prototypes[0].prototypeTexture=ProceduralAssets.GrassBladeTexture(bladeColor:new Color(.78f,.66f,.43f));
                prototypes[0].healthyColor=new Color(.78f,.65f,.42f);prototypes[0].dryColor=new Color(.64f,.45f,.27f);
                data.wavingGrassTint=new Color(.88f,.74f,.53f);
                data.detailPrototypes=prototypes;data.SetDetailResolution(detail,32);
                var grass=new int[detail,detail];
                for(int z=0;z<detail;z++)for(int x=0;x<detail;x++)
                {
                    float nx=(x+.5f)/detail,nz=(z+.5f)/detail,wx=nx*600-300,wz=nz*600-300;
                    if(Mathf.Abs(wx)>190||Mathf.Abs(wz)>190||data.GetSteepness(nx,nz)>32)continue;
                    grass[z,x]=Mathf.RoundToInt(9f*Mathf.SmoothStep(0,1,Mathf.InverseLerp(4,10,RoadDistance(wx,wz))));
                }
                data.SetDetailLayer(0,0,0,grass);
            }
            terrain.heightmapPixelError=1f;terrain.detailObjectDistance=140;terrain.detailObjectDensity=1;
            terrain.Flush();Dress(terrain);Lighting(gm);Physics.SyncTransforms();
        }
        static TerrainLayer Layer(string name,Color tint,float tile)
        {
            return new TerrainLayer{diffuseTexture=ProceduralAssets.LoadTex("Terrain/"+name+"_albedo"),
                normalMapTexture=ProceduralAssets.LoadTex("Terrain/"+name+"_normal"),normalScale=.7f,
                diffuseRemapMin=Vector4.zero,diffuseRemapMax=new Vector4(tint.r,tint.g,tint.b,1),
                tileSize=Vector2.one*tile,metallic=0,smoothness=0,specular=Color.black};
        }
        static void Lighting(GameManager gm)
        {
            var sun=RenderSettings.sun;
            if(sun!=null){sun.transform.rotation=Quaternion.Euler(27,-48,0);sun.color=new Color(1,.90f,.76f);sun.intensity=1.10f;sun.shadowStrength=.80f;}
            RenderSettings.fog=true;RenderSettings.fogMode=FogMode.ExponentialSquared;RenderSettings.fogDensity=.0028f;
            RenderSettings.fogColor=new Color(.76f,.75f,.73f);
            RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=new Color(.55f,.60f,.68f);
            RenderSettings.ambientEquatorColor=new Color(.51f,.45f,.38f);RenderSettings.ambientGroundColor=new Color(.28f,.22f,.17f);
            RenderSettings.reflectionIntensity=.25f;
            if(RenderSettings.skybox!=null){RenderSettings.skybox.SetFloat("_Exposure",1.12f);RenderSettings.skybox.SetFloat("_Rotation",48);}
            QualitySettings.shadowDistance=240;QualitySettings.lodBias=1.8f;
            var post=gm.PlayerEye.GetComponent<PostEffect>();
            if(post!=null){post.Exposure=1.04f;post.Saturation=.90f;post.BloomIntensity=.10f;}
            DynamicGI.UpdateEnvironment();
        }
        static void Dress(Terrain terrain)
        {
            var root=new GameObject("Autumn low hills").transform;var rng=new System.Random(9014);Obstacles.Clear();
            var stone=ProceduralAssets.TexturedMaterial(new Color(.90f,.86f,.76f),ProceduralAssets.LoadTex("Terrain/rock_albedo"),ProceduralAssets.LoadTex("Terrain/rock_normal"),.85f,.035f);
            var moss=ProceduralAssets.TexturedMaterial(new Color(.91f,.73f,.50f),ProceduralAssets.LoadTex("Terrain/forest_albedo"),ProceduralAssets.LoadTex("Terrain/forest_normal"),.5f,.015f);
            var bark=ProceduralAssets.TexturedMaterial(new Color(.62f,.57f,.48f),ProceduralAssets.LoadTex("Nature/bark_albedo"),ProceduralAssets.LoadTex("Nature/bark_normal"),.6f,.02f);
            for(int row=0;row<3;row++)for(int col=0;col<3;col++)
            {
                Vector2 p=(Node(row*4+col)+Node((row+1)*4+col+1))*.5f;
                Cliff(root,Ground(terrain,p,-.8f),2.8f,2.2f+(row+col)%3*.3f,row*7+col,stone,moss);
            }
            for(int i=0;i<12;i++)
            {
                float a=i*Mathf.PI*2/12,r=145+(i%4)*12;
                var p=new Vector2(Mathf.Cos(a)*r,Mathf.Sin(a)*r);
                Cliff(root,Ground(terrain,p,-.8f),3f+i%3*.4f,2.5f,i+30,stone,moss);
            }
            Physics.SyncTransforms();
            for(int i=0;i<420;i++)
            {
                float x=(float)rng.NextDouble()*370-185,z=(float)rng.NextDouble()*370-185;
                if(RoadDistance(x,z)<13||Normal(terrain,new Vector3(x,0,z)).y<.83f)continue;
                Vector3 p=TerrainGenerator.OnGround(terrain,x,z);
                if(Physics.Raycast(p+Vector3.up*100,Vector3.down,out var surface,110,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)
                    &&(surface.collider is MeshCollider||surface.collider is TerrainCollider))
                {if(surface.normal.y<.8f)continue;p=surface.point;}
                if(i%17==0)
                {
                    var dead=new GameObject("Bare pine silhouette",typeof(MeshFilter),typeof(MeshRenderer));
                    dead.transform.SetParent(root,false);dead.transform.position=p;dead.transform.rotation=Quaternion.Euler(0,i*39,3);
                    dead.GetComponent<MeshFilter>().sharedMesh=MeshBuilder.DeadPine(rng,7+i%5);
                    dead.GetComponent<MeshRenderer>().sharedMaterials=new[]{bark,bark};dead.AddComponent<OwnedHandMesh>();
                }
                else if(i%3==0)
                {
                    bool evergreen=i%4==0;
                    var tree=Vegetation.Tree(root,p,.6f+(float)rng.NextDouble()*.6f,evergreen?Vegetation.TreeType.Pine:Vegetation.TreeType.Broadleaf,rng);
                    AutumnLeaves(tree,evergreen?new Color(.30f,.32f,.23f):AutumnColor(i));
                }
                else
                {
                    var bush=Vegetation.Bush(root,p,.3f+(float)rng.NextDouble()*.6f,rng);
                    AutumnLeaves(bush,AutumnColor(i));
                }
            }
            Physics.SyncTransforms();
            foreach(var collider in root.GetComponentsInChildren<Collider>())
            {
                if(!collider.enabled||collider.isTrigger)continue;
                Bounds b=collider.bounds;
                Obstacles.Add(new Vector3(b.center.x,b.center.z,new Vector2(b.extents.x,b.extents.z).magnitude));
            }
        }
        static Color AutumnColor(int index)
        {
            switch(index%4)
            {
                case 0:return new Color(.72f,.46f,.17f); // Ochre
                case 1:return new Color(.66f,.28f,.12f); // Burnt orange
                case 2:return new Color(.49f,.20f,.12f); // Russet
                default:return new Color(.68f,.56f,.29f); // Dry gold
            }
        }
        static void AutumnLeaves(GameObject plant,Color color)
        {
            // Pack LOD material order varies; identify foliage by shader, not slot 1.
            // The original distant proxy has bark in slot 0 and textured leaves in slot 1.
            var block=new MaterialPropertyBlock();
            foreach(var renderer in plant.GetComponentsInChildren<MeshRenderer>(true))
            {
                var materials=renderer.sharedMaterials;
                for(int slot=0;slot<materials.Length;slot++)
                {
                    var material=materials[slot];if(material==null)continue;
                    bool packLeaf=material.shader!=null&&material.shader.name=="SniperRidge/Foliage";
                    if(!packLeaf&&(renderer.gameObject!=plant||slot!=1))continue;
                    renderer.GetPropertyBlock(block,slot);
                    // Counter the green albedo in the distant textured leaf proxy.
                    Color tint=packLeaf?color:new Color(color.r*2.5f,color.g*.85f,color.b,1);
                    block.SetColor("_Color",tint);block.SetColor("_BaseColor",tint);
                    renderer.SetPropertyBlock(block,slot);block.Clear();
                }
            }
        }
        static void Cliff(Transform root,Vector3 position,float radius,float height,int seed,Material rock,Material moss)
        {
            const int sides=14,rings=10;
            var vertices=new List<Vector3>();var uv=new List<Vector2>();var faces=new List<int>();var cap=new List<int>();
            for(int ring=0;ring<rings;ring++)for(int side=0;side<=sides;side++)
            {
                float a=(side%sides)*Mathf.PI*2/sides;
                float band=1f-(ring/3)*.12f+(ring%3==1?.09f:0);
                float r=radius*band*(.87f+.15f*Mathf.PerlinNoise((side%sides)*.71f,seed));
                vertices.Add(new Vector3(Mathf.Cos(a)*r,height*ring/(rings-1f)+.3f*Mathf.Sin(a*3+seed),Mathf.Sin(a)*r));
                uv.Add(new Vector2(side/(float)sides*radius*1.7f,height*ring/(rings-1f))*.3f);
                if(ring==0||side==sides)continue;
                int b=ring*(sides+1)+side,t=b-(sides+1);
                faces.Add(t);faces.Add(b);faces.Add(t+1);faces.Add(t+1);faces.Add(b);faces.Add(b+1);
            }
            int capStart=vertices.Count;
            for(int i=0;i<=sides;i++)
            {Vector3 p=vertices[(rings-1)*(sides+1)+i];vertices.Add(p);uv.Add(new Vector2(p.x,p.z)*.3f);}
            int centre=vertices.Count;vertices.Add(Vector3.up*height);uv.Add(Vector2.zero);
            for(int i=0;i<sides;i++){cap.Add(centre);cap.Add(capStart+i+1);cap.Add(capStart+i);}
            var mesh=new Mesh{name="Layered limestone "+seed};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.subMeshCount=2;
            mesh.SetTriangles(faces,0);mesh.SetTriangles(cap,1);mesh.RecalculateNormals();mesh.RecalculateBounds();mesh.RecalculateTangents();
            var go=new GameObject("Stratified cliff",typeof(MeshFilter),typeof(MeshRenderer),typeof(MeshCollider));
            go.transform.SetParent(root,false);go.transform.position=position;go.transform.rotation=Quaternion.Euler(0,seed*37,0);
            go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterials=new[]{rock,moss};
            go.GetComponent<MeshCollider>().sharedMesh=mesh;go.AddComponent<OwnedHandMesh>();
        }
    }
}
