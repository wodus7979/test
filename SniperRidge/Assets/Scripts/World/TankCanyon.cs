using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>Open winter tank valley with snow forest, boulders and connected fallback roads.</summary>
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
            data.terrainLayers=new[]{SnowLayer(new Color(.91f,.94f,.98f),5.8f,41f),
                Layer("NaturePack/Textures/rock",new Color(.54f,.58f,.60f),6.5f),
                Layer("Terrain/dirt",new Color(.48f,.40f,.32f),4.8f),
                SnowLayer(new Color(.69f,.74f,.78f),8.5f,73f)};
            data.alphamapResolution=alpha;var weights=new float[alpha,alpha,4];
            for(int z=0;z<alpha;z++)for(int x=0;x<alpha;x++)
            {
                float nx=(x+.5f)/alpha,nz=(z+.5f)/alpha,wx=nx*600-300,wz=nz*600-300;
                float road=RoadDistance(wx,wz),slope=data.GetSteepness(nx,nz);
                float rock=Mathf.InverseLerp(14,36,slope)*.78f;
                float dirt=(1-rock)*(1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(3.8f,10.8f,road)))*.72f;
                float patch=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.42f,.72f,Mathf.PerlinNoise(wx*.035f+5,wz*.035f)));
                float darkMeadow=(1-rock-dirt)*(.04f+patch*.13f);
                weights[z,x,0]=1-rock-dirt-darkMeadow;weights[z,x,1]=rock;weights[z,x,2]=dirt;weights[z,x,3]=darkMeadow;
            }
            data.SetAlphamaps(0,0,weights);
            // The custom matte shader can keep the stale basemap after TerrainLayer
            // replacement in a player build. Built-in Diffuse refreshes the splats
            // immediately and has no metallic or smooth specular road reflection.
            var terrainShader=Shader.Find("Nature/Terrain/Diffuse");
            if(terrainShader!=null)terrain.materialTemplate=new Material(terrainShader){name="Winter diffuse terrain"};
            terrain.drawInstanced=false;terrain.drawHeightmap=true;terrain.basemapDistance=350f;
            var prototypes=data.detailPrototypes;
            if(prototypes.Length>0)
            {
                prototypes[0].minHeight=.16f;prototypes[0].maxHeight=.42f;
                prototypes[0].prototypeTexture=ProceduralAssets.GrassBladeTexture(bladeColor:new Color(.42f,.36f,.28f));
                prototypes[0].healthyColor=new Color(.48f,.43f,.35f);prototypes[0].dryColor=new Color(.61f,.57f,.50f);
                data.wavingGrassTint=new Color(.52f,.49f,.44f);
                data.detailPrototypes=prototypes;data.SetDetailResolution(detail,32);
                var grass=new int[detail,detail];
                for(int z=0;z<detail;z++)for(int x=0;x<detail;x++)
                {
                    float nx=(x+.5f)/detail,nz=(z+.5f)/detail,wx=nx*600-300,wz=nz*600-300;
                    if(Mathf.Abs(wx)>190||Mathf.Abs(wz)>190||data.GetSteepness(nx,nz)>32)continue;
                    // 밀도를 낮춰 높은 곳에서 풀잎이 모래 위 반짝임처럼 보이지 않게 한다.
                    grass[z,x]=Mathf.RoundToInt(.65f*Mathf.SmoothStep(0,1,Mathf.InverseLerp(6,15,RoadDistance(wx,wz))));
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
        static TerrainLayer SnowLayer(Color tint,float tile,float seed)
        {
            var texture=ProceduralAssets.NoiseTexture(128,new Color(.82f,.86f,.91f),Color.white,7f,seed);
            texture.name="Wind packed snow";
            return new TerrainLayer{diffuseTexture=texture,normalScale=.08f,
                diffuseRemapMin=Vector4.zero,diffuseRemapMax=new Vector4(tint.r,tint.g,tint.b,1),
                tileSize=Vector2.one*tile,metallic=0,smoothness=.06f,specular=new Color(.08f,.09f,.11f)};
        }
        static void Lighting(GameManager gm)
        {
            var sun=RenderSettings.sun;
            if(sun!=null){sun.transform.rotation=Quaternion.Euler(24,-48,0);sun.color=new Color(1f,.87f,.72f);sun.intensity=1.05f;sun.shadowStrength=.88f;}
            RenderSettings.fog=true;RenderSettings.fogMode=FogMode.ExponentialSquared;RenderSettings.fogDensity=.00115f;
            RenderSettings.fogColor=new Color(.62f,.69f,.78f);
            RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=new Color(.46f,.56f,.70f);
            RenderSettings.ambientEquatorColor=new Color(.38f,.42f,.48f);RenderSettings.ambientGroundColor=new Color(.22f,.24f,.27f);
            RenderSettings.reflectionIntensity=.20f;
            var skyShader=Shader.Find("Skybox/Procedural");
            if(skyShader!=null)
            {
                var sky=new Material(skyShader){name="Tank winter sky"};
                sky.SetColor("_SkyTint",new Color(.31f,.47f,.68f));
                sky.SetColor("_GroundColor",new Color(.44f,.47f,.52f));
                sky.SetFloat("_Exposure",.90f);sky.SetFloat("_AtmosphereThickness",.92f);sky.SetFloat("_SunSize",.055f);
                RenderSettings.skybox=sky;
            }
            QualitySettings.shadowDistance=240;QualitySettings.lodBias=1.8f;
            var post=gm.PlayerEye.GetComponent<PostEffect>();
            if(post!=null){post.Exposure=.94f;post.Saturation=.88f;post.Contrast=1.10f;post.BloomIntensity=.045f;post.Vignette=.08f;}
            DynamicGI.UpdateEnvironment();
        }
        static void Dress(Terrain terrain)
        {
            var root=new GameObject("Snow forest battlefield").transform;var rng=new System.Random(9014);Obstacles.Clear();
            var stone=ProceduralAssets.TexturedMaterial(new Color(.49f,.51f,.49f),
                Resources.Load<Texture2D>("NaturePack/Textures/rock_albedo"),Resources.Load<Texture2D>("NaturePack/Textures/rock_normal_unity"),.42f,.025f);
            var snow=ProceduralAssets.TexturedMaterial(new Color(.88f,.93f,.99f),
                ProceduralAssets.NoiseTexture(64,new Color(.78f,.84f,.91f),Color.white,6,27),null,1.5f,.07f);
            var timber=ProceduralAssets.TexturedMaterial(new Color(.29f,.21f,.14f),
                Resources.Load<Texture2D>("Nature/bark_albedo"),Resources.Load<Texture2D>("Nature/bark_normal"),1.2f,.01f);
            Pond(root);
            // Solid boulders create firing cover while staying clear of every road.
            for(int i=0;i<64;i++)
            {
                float x=(float)rng.NextDouble()*236-118,z=(float)rng.NextDouble()*236-118;
                if(RoadDistance(x,z)<15f||Normal(terrain,new Vector3(x,0,z)).y<.9f)continue;
                Vector3 p=TerrainGenerator.OnGround(terrain,x,z,.12f);
                WinterBoulder(root,p,new Vector3(1.7f+(float)rng.NextDouble()*2.3f,1.1f+(float)rng.NextDouble()*1.5f,1.5f+(float)rng.NextDouble()*2f),i,stone,snow);
            }
            Physics.SyncTransforms();
            // Snow trees stay clear of the wide tank corridors. Trees inside the
            // arena retain the collision-triggered falling action.
            for(int i=0;i<1120;i++)
            {
                float x=(float)rng.NextDouble()*410-205,z=(float)rng.NextDouble()*410-205;
                float radius=Mathf.Max(Mathf.Abs(x),Mathf.Abs(z));
                if(LakeWeight(x,z)>.12f||RoadDistance(x,z)<8.5f)continue;
                Vector3 probe=new Vector3(x,0,z);if(Normal(terrain,probe).y<(radius<112f?.88f:.72f))continue;
                float grove=Mathf.PerlinNoise(x*.024f+7,z*.024f+13);
                if(grove<(radius<112f?.38f:.24f))continue;
                Vector3 p=TerrainGenerator.OnGround(terrain,x,z);
                bool bare=i%9==0;
                var tree=Vegetation.WinterTree(root,p,.76f+(float)rng.NextDouble()*.68f,bare,rng);
                if(radius<112f){tree.name="Knock-down "+tree.name;tree.AddComponent<KnockdownTree>();}
                else foreach(var collider in tree.GetComponentsInChildren<Collider>(true))collider.enabled=false;
            }
            // Cosmetic debris matches the supplied winter prop reference. These
            // pieces do not collide, so a tank cannot become wedged between them.
            for(int i=0;i<92;i++)
            {
                float x=(float)rng.NextDouble()*250-125,z=(float)rng.NextDouble()*250-125;
                if(RoadDistance(x,z)<10f)continue;
                var brush=Vegetation.WinterTree(root,TerrainGenerator.OnGround(terrain,x,z),.10f+(float)rng.NextDouble()*.07f,true,rng);
                brush.name="Snowy dead brush";foreach(var collider in brush.GetComponentsInChildren<Collider>(true))collider.enabled=false;
            }
            for(int i=0;i<24;i++)WinterStump(root,terrain,rng,snow,timber,i);
            for(int i=0;i<20;i++)FallenLog(root,terrain,rng,snow,timber,i);
            Physics.SyncTransforms();
            foreach(var collider in root.GetComponentsInChildren<Collider>())
            {
                if(!collider.enabled||collider.isTrigger||collider.GetComponentInParent<KnockdownTree>()!=null)continue;
                Bounds b=collider.bounds;
                Obstacles.Add(new Vector3(b.center.x,b.center.z,new Vector2(b.extents.x,b.extents.z).magnitude));
            }
        }
        static GameObject WinterBoulder(Transform root,Vector3 position,Vector3 scale,int index,Material stone,Material snow)
        {
            var rock=GameObject.CreatePrimitive(PrimitiveType.Sphere);rock.name="Mossy snow boulder";rock.transform.SetParent(root,true);
            rock.transform.position=position;rock.transform.localScale=scale;rock.transform.rotation=Quaternion.Euler(index*11f,index*67f,index*7f);
            rock.GetComponent<Renderer>().sharedMaterial=stone;
            var cap=GameObject.CreatePrimitive(PrimitiveType.Sphere);cap.name="Snow cap";cap.transform.SetParent(root,true);
            cap.transform.position=position+Vector3.up*(scale.y*.70f);cap.transform.localScale=new Vector3(scale.x*.91f,scale.y*.20f,scale.z*.91f);
            cap.transform.rotation=Quaternion.Euler(0,index*67f,0);cap.GetComponent<Renderer>().sharedMaterial=snow;cap.GetComponent<Collider>().enabled=false;
            return rock;
        }
        static void WinterStump(Transform root,Terrain terrain,System.Random rng,Material snow,Material timber,int index)
        {
            float x=(float)rng.NextDouble()*232-116,z=(float)rng.NextDouble()*232-116;if(RoadDistance(x,z)<12f)return;
            Vector3 p=TerrainGenerator.OnGround(terrain,x,z,.25f);float height=.7f+(float)rng.NextDouble()*.8f;
            var stump=GameObject.CreatePrimitive(PrimitiveType.Cylinder);stump.name="Broken snowy stump";stump.transform.SetParent(root,true);
            stump.transform.position=p+Vector3.up*height*.5f;stump.transform.localScale=new Vector3(.35f,height*.5f,.35f);stump.transform.rotation=Quaternion.Euler(index%3*3,index*41,0);
            stump.GetComponent<Renderer>().sharedMaterial=timber;stump.GetComponent<Collider>().enabled=false;
            var cap=GameObject.CreatePrimitive(PrimitiveType.Cylinder);cap.name="Stump snow";cap.transform.SetParent(root,true);
            cap.transform.position=p+Vector3.up*(height+.035f);cap.transform.localScale=new Vector3(.38f,.035f,.38f);cap.GetComponent<Renderer>().sharedMaterial=snow;cap.GetComponent<Collider>().enabled=false;
        }
        static void FallenLog(Transform root,Terrain terrain,System.Random rng,Material snow,Material timber,int index)
        {
            float x=(float)rng.NextDouble()*226-113,z=(float)rng.NextDouble()*226-113;if(RoadDistance(x,z)<13f)return;
            Vector3 p=TerrainGenerator.OnGround(terrain,x,z,.35f);float length=3.2f+(float)rng.NextDouble()*3.8f,yaw=(float)rng.NextDouble()*360;
            Quaternion rotation=Quaternion.Euler(0,yaw,90);
            var log=GameObject.CreatePrimitive(PrimitiveType.Cylinder);log.name="Fallen snow log";log.transform.SetParent(root,true);
            log.transform.position=p;log.transform.rotation=rotation;log.transform.localScale=new Vector3(.34f,length*.5f,.34f);log.GetComponent<Renderer>().sharedMaterial=timber;log.GetComponent<Collider>().enabled=false;
            var cover=GameObject.CreatePrimitive(PrimitiveType.Cylinder);cover.name="Log snow ridge";cover.transform.SetParent(root,true);
            cover.transform.position=p+Vector3.up*.19f;cover.transform.rotation=rotation;cover.transform.localScale=new Vector3(.28f,length*.46f,.16f);cover.GetComponent<Renderer>().sharedMaterial=snow;cover.GetComponent<Collider>().enabled=false;
        }
        static void Pond(Transform root)
        {
            var water=GameObject.CreatePrimitive(PrimitiveType.Cylinder);water.name="Frozen mountain lake";water.transform.SetParent(root,true);
            water.transform.position=new Vector3(0,9.25f,145f);water.transform.localScale=new Vector3(61f,.035f,33f);
            var waterCollider=water.GetComponent<Collider>();waterCollider.enabled=false;Object.Destroy(waterCollider);
            var shader=Shader.Find("Standard");var material=new Material(shader){name="Clouded blue ice"};
            material.color=new Color(.48f,.67f,.75f,.88f);material.SetFloat("_Metallic",.02f);material.SetFloat("_Glossiness",.42f);
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
