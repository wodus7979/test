using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>Open alpine tank valley with forests, boulders and connected fallback roads.</summary>
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
            float floor=12f+1.35f*Mathf.Sin(z*.026f)+1.05f*Mathf.Sin(x*.031f)+.55f*Mathf.Sin((x+z)*.046f);
            float distance=Mathf.Max(Mathf.Abs(x),Mathf.Abs(z));
            float outer=Mathf.SmoothStep(0,1,Mathf.InverseLerp(104,275,distance));
            // Tall distant ridges frame the valley while the playable 200m square
            // remains low enough for tanks to cross in any direction.
            float ridges=70f+43f*Mathf.PerlinNoise(x*.018f+8.4f,z*.018f+3.1f)+27f*Mathf.Abs(Mathf.Sin(x*.032f-z*.011f));
            float height=floor+outer*ridges;
            // A lake beyond the north edge opens the view toward the mountain ring.
            float lake=LakeWeight(x,z);
            if(z>102f)height=Mathf.Lerp(height,9.1f,lake);
            return height;
        }
        static float LakeWeight(float x,float z)
        {
            float dx=x/62f,dz=(z-145f)/34f;
            return Mathf.SmoothStep(0,1,Mathf.Clamp01(1f-(dx*dx+dz*dz)));
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
            // Changing an existing TerrainData resolution can restore Unity's
            // 1000 x 600 x 1000 default size. Reassert world metres before writing
            // heights or SampleHeight will put tanks and scenery high in the air.
            data.size=new Vector3(TerrainGenerator.Size,TerrainGenerator.MaxHeight,TerrainGenerator.Size);
            var heights=new float[resolution,resolution];
            for(int z=0;z<resolution;z++)for(int x=0;x<resolution;x++)
                heights[z,x]=Height(x/(float)(resolution-1)*600-300,z/(float)(resolution-1)*600-300)/TerrainGenerator.MaxHeight;
            data.SetHeights(0,0,heights);
            data.terrainLayers=new[]{Layer("NaturePack/Textures/meadow",Color.white,5.5f),
                Layer("NaturePack/Textures/rock",new Color(.96f,.95f,.93f),7f),
                Layer("Terrain/dirt",new Color(.90f,.84f,.73f),5.2f),
                Layer("NaturePack/Textures/meadow",new Color(.72f,.80f,.66f),9f)};
            data.alphamapResolution=alpha;var weights=new float[alpha,alpha,4];
            for(int z=0;z<alpha;z++)for(int x=0;x<alpha;x++)
            {
                float nx=(x+.5f)/alpha,nz=(z+.5f)/alpha,wx=nx*600-300,wz=nz*600-300;
                float road=RoadDistance(wx,wz),slope=data.GetSteepness(nx,nz);
                float rock=Mathf.InverseLerp(12,34,slope)*.92f;
                float dirt=(1-rock)*(1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(3.7f,10.5f,road)))*.88f;
                float patch=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.42f,.72f,Mathf.PerlinNoise(wx*.035f+5,wz*.035f)));
                float darkMeadow=(1-rock-dirt)*(.06f+patch*.24f);
                weights[z,x,0]=1-rock-dirt-darkMeadow;weights[z,x,1]=rock;weights[z,x,2]=dirt;weights[z,x,3]=darkMeadow;
            }
            data.SetAlphamaps(0,0,weights);
            // The custom matte shader can keep the stale basemap after TerrainLayer
            // replacement in a player build. Built-in Diffuse refreshes the splats
            // immediately and has no metallic or smooth specular road reflection.
            var terrainShader=Shader.Find("Nature/Terrain/Diffuse");
            if(terrainShader!=null)terrain.materialTemplate=new Material(terrainShader){name="Alpine diffuse terrain"};
            terrain.drawInstanced=false;terrain.drawHeightmap=true;terrain.basemapDistance=350f;
            var prototypes=data.detailPrototypes;
            if(prototypes.Length>0)
            {
                prototypes[0].minHeight=.25f;prototypes[0].maxHeight=.65f;
                prototypes[0].prototypeTexture=ProceduralAssets.GrassBladeTexture(bladeColor:new Color(.38f,.55f,.25f));
                prototypes[0].healthyColor=new Color(.44f,.61f,.30f);prototypes[0].dryColor=new Color(.57f,.52f,.31f);
                data.wavingGrassTint=new Color(.50f,.64f,.35f);
                data.detailPrototypes=prototypes;data.SetDetailResolution(detail,32);
                var grass=new int[detail,detail];
                for(int z=0;z<detail;z++)for(int x=0;x<detail;x++)
                {
                    float nx=(x+.5f)/detail,nz=(z+.5f)/detail,wx=nx*600-300,wz=nz*600-300;
                    if(Mathf.Abs(wx)>190||Mathf.Abs(wz)>190||data.GetSteepness(nx,nz)>32)continue;
                    // 밀도를 낮춰 높은 곳에서 풀잎이 모래 위 반짝임처럼 보이지 않게 한다.
                    grass[z,x]=Mathf.RoundToInt(2f*Mathf.SmoothStep(0,1,Mathf.InverseLerp(5,12,RoadDistance(wx,wz))));
                }
                data.SetDetailLayer(0,0,0,grass);
            }
            terrain.heightmapPixelError=1f;terrain.detailObjectDistance=85;terrain.detailObjectDensity=.48f;
            terrain.Flush();Dress(terrain);Lighting(gm);Physics.SyncTransforms();
        }
        static TerrainLayer Layer(string resourceBase,Color tint,float tile)
        {
            var normal=Resources.Load<Texture2D>(resourceBase+"_normal_unity");
            if(normal==null)normal=Resources.Load<Texture2D>(resourceBase+"_normal");
            return new TerrainLayer{diffuseTexture=Resources.Load<Texture2D>(resourceBase+"_albedo"),
                normalMapTexture=normal,normalScale=.22f,
                diffuseRemapMin=Vector4.zero,diffuseRemapMax=new Vector4(tint.r,tint.g,tint.b,1f),
                tileSize=Vector2.one*tile,metallic=0,smoothness=0,specular=Color.black};
        }
        static void Lighting(GameManager gm)
        {
            var sun=RenderSettings.sun;
            if(sun!=null){sun.transform.rotation=Quaternion.Euler(31,-52,0);sun.color=new Color(1f,.94f,.83f);sun.intensity=1.18f;sun.shadowStrength=.84f;}
            RenderSettings.fog=true;RenderSettings.fogMode=FogMode.ExponentialSquared;RenderSettings.fogDensity=.00078f;
            RenderSettings.fogColor=new Color(.68f,.78f,.87f);
            RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=new Color(.55f,.65f,.77f);
            RenderSettings.ambientEquatorColor=new Color(.45f,.49f,.54f);RenderSettings.ambientGroundColor=new Color(.28f,.27f,.23f);
            RenderSettings.reflectionIntensity=.26f;
            var skyShader=Shader.Find("Skybox/Procedural");
            if(skyShader!=null)
            {
                var sky=new Material(skyShader){name="Tank alpine sky"};
                sky.SetColor("_SkyTint",new Color(.38f,.61f,.86f));
                sky.SetColor("_GroundColor",new Color(.38f,.44f,.49f));
                sky.SetFloat("_Exposure",.98f);sky.SetFloat("_AtmosphereThickness",.74f);sky.SetFloat("_SunSize",.045f);
                RenderSettings.skybox=sky;
            }
            QualitySettings.shadowDistance=240;QualitySettings.lodBias=1.8f;
            var post=gm.PlayerEye.GetComponent<PostEffect>();
            if(post!=null){post.Exposure=.96f;post.Saturation=1.04f;post.Contrast=1.06f;post.BloomIntensity=.055f;post.Vignette=.06f;}
            DynamicGI.UpdateEnvironment();
        }
        static void Dress(Terrain terrain)
        {
            var root=new GameObject("Alpine forest valley").transform;var rng=new System.Random(9014);Obstacles.Clear();
            var stone=ProceduralAssets.TexturedMaterial(new Color(.82f,.82f,.79f),
                Resources.Load<Texture2D>("NaturePack/Textures/rock_albedo"),Resources.Load<Texture2D>("NaturePack/Textures/rock_normal_unity"),.42f,.025f);
            Pond(root);
            // Solid boulders create firing cover while staying clear of every road.
            for(int i=0;i<64;i++)
            {
                float x=(float)rng.NextDouble()*236-118,z=(float)rng.NextDouble()*236-118;
                if(RoadDistance(x,z)<15f||Normal(terrain,new Vector3(x,0,z)).y<.9f)continue;
                Vector3 p=TerrainGenerator.OnGround(terrain,x,z,.12f);
                Boulder(root,p,new Vector3(1.7f+(float)rng.NextDouble()*2.3f,1.1f+(float)rng.NextDouble()*1.5f,1.5f+(float)rng.NextDouble()*2f),i,stone);
            }
            Physics.SyncTransforms();
            // Dense enough to read as a forest, sparse enough for the two LODs and
            // wide tank corridors. Trees inside the arena can be knocked down.
            for(int i=0;i<1350;i++)
            {
                float x=(float)rng.NextDouble()*410-205,z=(float)rng.NextDouble()*410-205;
                float radius=Mathf.Max(Mathf.Abs(x),Mathf.Abs(z));
                if(LakeWeight(x,z)>.12f||RoadDistance(x,z)<8.5f)continue;
                Vector3 probe=new Vector3(x,0,z);if(Normal(terrain,probe).y<(radius<112f?.88f:.72f))continue;
                float grove=Mathf.PerlinNoise(x*.024f+7,z*.024f+13);
                if(grove<(radius<112f?.38f:.24f))continue;
                Vector3 p=TerrainGenerator.OnGround(terrain,x,z);
                bool pine=i%7!=0;
                var tree=Vegetation.Tree(root,p,.78f+(float)rng.NextDouble()*.72f,pine?Vegetation.TreeType.Pine:Vegetation.TreeType.Broadleaf,rng);
                if(radius<112f){tree.name="Knock-down "+tree.name;tree.AddComponent<KnockdownTree>();}
                else foreach(var collider in tree.GetComponentsInChildren<Collider>(true))collider.enabled=false;
            }
            for(int i=0;i<180;i++)
            {
                float x=(float)rng.NextDouble()*250-125,z=(float)rng.NextDouble()*250-125;
                if(RoadDistance(x,z)<7f)continue;
                var bush=Vegetation.Bush(root,TerrainGenerator.OnGround(terrain,x,z),.28f+(float)rng.NextDouble()*.42f,rng);
                foreach(var collider in bush.GetComponentsInChildren<Collider>(true))collider.enabled=false;
            }
            Physics.SyncTransforms();
            foreach(var collider in root.GetComponentsInChildren<Collider>())
            {
                if(!collider.enabled||collider.isTrigger||collider.GetComponentInParent<KnockdownTree>()!=null)continue;
                Bounds b=collider.bounds;
                Obstacles.Add(new Vector3(b.center.x,b.center.z,new Vector2(b.extents.x,b.extents.z).magnitude));
            }
        }
        static GameObject Boulder(Transform root,Vector3 position,Vector3 scale,int index,Material stone)
        {
            var rock=GameObject.CreatePrimitive(PrimitiveType.Sphere);rock.name="Granite boulder";rock.transform.SetParent(root,true);
            rock.transform.position=position;rock.transform.localScale=scale;rock.transform.rotation=Quaternion.Euler(index*11f,index*67f,index*7f);
            rock.GetComponent<Renderer>().sharedMaterial=stone;
            return NatureModels.Upgrade(rock,index%2==0?"boulder_1":"boulder_2");
        }
        static void Pond(Transform root)
        {
            var water=GameObject.CreatePrimitive(PrimitiveType.Cylinder);water.name="Mountain lake";water.transform.SetParent(root,true);
            water.transform.position=new Vector3(0,9.25f,145f);water.transform.localScale=new Vector3(61f,.035f,33f);
            var waterCollider=water.GetComponent<Collider>();waterCollider.enabled=false;Object.Destroy(waterCollider);
            var shader=Shader.Find("Standard");var material=new Material(shader){name="Clear mountain water"};
            material.color=new Color(.18f,.42f,.52f,.72f);material.SetFloat("_Metallic",.05f);material.SetFloat("_Glossiness",.72f);
            material.SetFloat("_Mode",3);material.SetInt("_SrcBlend",(int)BlendMode.SrcAlpha);material.SetInt("_DstBlend",(int)BlendMode.OneMinusSrcAlpha);
            material.SetInt("_ZWrite",0);material.EnableKeyword("_ALPHABLEND_ON");material.renderQueue=3000;
            water.GetComponent<Renderer>().sharedMaterial=material;
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
