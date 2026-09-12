using UnityEngine;

namespace SniperRidge
{
    /// <summary>Dry surfaces, clustered vegetation and small-scale ground detail for the authored maps.</summary>
    public static class BattlefieldScenery
    {
        static Material stone, dirt, dryAsphalt;
        public static float TrackCentre(float z) => 24f + Mathf.Sin(z*.019f)*18f;
        public static float TrackWeight(float x,float z)
        {
            float centre=TrackCentre(z);
            float distance=Mathf.Min(Mathf.Abs(x-centre-2f),Mathf.Abs(x-centre+2f));
            return Mathf.Clamp01(1f-distance/2.8f)*.88f;
        }
        static void Materials()
        {
            if(stone!=null)return;
            stone=ProceduralAssets.TexturedMaterial(new Color(.72f,.70f,.65f),ProceduralAssets.LoadTex("Terrain/rock_albedo"),ProceduralAssets.LoadTex("Terrain/rock_normal"),.35f,.02f);
            dirt=ProceduralAssets.TexturedMaterial(new Color(.52f,.43f,.30f),ProceduralAssets.LoadTex("Terrain/dirt_albedo"),ProceduralAssets.LoadTex("Terrain/dirt_normal"),.3f,.0f);
            Dry(stone);Dry(dirt);
        }
        public static void Dry(Material material)
        {
            if(material==null)return;
            material.SetFloat("_Metallic",0f);material.SetFloat("_Glossiness",0f);material.SetFloat("_GlossMapScale",0f);
            if(material.HasProperty("_Smoothness"))material.SetFloat("_Smoothness",0f);
            if(material.HasProperty("_SmoothnessRemapMax"))material.SetFloat("_SmoothnessRemapMax",0f);
            if(material.HasProperty("_MetallicRemapMax"))material.SetFloat("_MetallicRemapMax",0f);
            if(material.HasProperty("_NormalScale"))material.SetFloat("_NormalScale",.22f);
            material.SetFloat("_SpecularHighlights",0f);material.SetFloat("_GlossyReflections",0f);
            material.EnableKeyword("_SPECULARHIGHLIGHTS_OFF");material.EnableKeyword("_GLOSSYREFLECTIONS_OFF");
            if(material.HasProperty("_BumpScale"))material.SetFloat("_BumpScale",.22f);
        }
        static GameObject Rock(Transform parent,Vector3 position,Vector3 scale,int index)
        {
            Materials();var rock=GameObject.CreatePrimitive(PrimitiveType.Sphere);rock.name="Weathered boulder";
            rock.transform.SetParent(parent,true);rock.transform.position=position;
            rock.transform.localScale=scale;rock.transform.rotation=Quaternion.Euler(0,index*73f,0);
            rock.GetComponent<Renderer>().sharedMaterial=stone;
            return NatureModels.Upgrade(rock,index%2==0?"boulder_1":"boulder_2");
        }
        public static void FieldDetails(GameManager gm)
        {
            Materials();var root=new GameObject("Field ground variation").transform;
            var rng=new System.Random(337);
            for(int i=0;i<100;i++)
            {
                float x=(float)rng.NextDouble()*540-270,z=(float)rng.NextDouble()*540-270;
                // Small surface debris cannot block the original sniper firing fan.
                if(BattlefieldLayout.IsCombatLane(x,z))continue;
                var p=TerrainGenerator.OnGround(gm.Terrain,x,z,.04f);
                Patch(root,p,Vector3.up,.25f+(float)rng.NextDouble()*.7f,i%3==0?dirt:stone,i);
                if(i%4==0)Vegetation.Bush(root,p,.3f+(float)rng.NextDouble()*.5f,rng);
            }
        }
        public static void BuildTankField(GameManager gm)
        {
            Materials();var terrain=gm.Terrain;var data=terrain.terrainData;
            // The tank arena has no player's dugout. Restore only the previously excavated patch.
            int res=data.heightmapResolution;
            int x0=Mathf.FloorToInt((280f/TerrainGenerator.Size)*(res-1));
            int z0=Mathf.FloorToInt((180f/TerrainGenerator.Size)*(res-1));
            int count=Mathf.CeilToInt(40f/TerrainGenerator.Size*(res-1))+2;
            var patch=new float[count,count];
            for(int z=0;z<count;z++)for(int x=0;x<count;x++)patch[z,x]=TerrainGenerator.FieldElevation/TerrainGenerator.MaxHeight;
            data.SetHeights(x0,z0,patch);terrain.Flush();
            var root=new GameObject("Tank battlefield woodland").transform;
            var rng=new System.Random(2141);
            for(int i=0;i<650;i++)
            {
                float x=(float)rng.NextDouble()*560-280,z=(float)rng.NextDouble()*560-280;
                float radius=new Vector2(x,z).magnitude;
                if(radius>300 || radius<35 || (radius>154&&radius<187) || Mathf.Abs(x)<14 || Mathf.Abs(z)<12)continue;
                bool nearPost=false;for(int p=0;p<6;p++)if(Vector3.Distance(new Vector3(x,12,z),TankBattle.Post(p))<14)nearPost=true;
                if(nearPost)continue;
                // Group trees into groves, leaving wide approach routes between them.
                if(radius<205&&Mathf.PerlinNoise(x*.017f+9,z*.017f+7)<.58f)continue;
                var pos=TerrainGenerator.OnGround(terrain,x,z);
                Vegetation.Tree(root,pos,.65f+(float)rng.NextDouble()*.8f,i%3==0?Vegetation.TreeType.Pine:Vegetation.TreeType.Broadleaf,rng);
                if(i%3==0)Vegetation.Bush(root,pos+Vector3.right*3,.5f,rng);
                if(i%5==0)Rock(root,pos+new Vector3(4,.3f,2),new Vector3(3.2f,2.1f,2.7f),i);
            }
            for(int i=0;i<6;i++)
            {
                Vector3 post=TankBattle.Post(i);
                Vector3 front=(new Vector3(0,12,-150)-post).normalized;
                Rock(root,post+front*2.4f+Vector3.up*.32f,new Vector3(4.5f,3.5f,2.7f),i);
                Vegetation.Tree(root,post+Vector3.Cross(Vector3.up,front)*6f,.85f,Vegetation.TreeType.Broadleaf,rng);
            }
            FieldDetails(gm);Physics.SyncTransforms();
        }
        public static void CityDetails(GameManager gm)
        {
            Materials();var root=new GameObject("Dry city street details").transform;
            if(dryAsphalt==null)dryAsphalt=new Material(Resources.Load<Material>("CityPack/Materials/Asphalt"));Dry(dryAsphalt);
            dryAsphalt.color=new Color(.32f,.34f,.35f);
            var rng=new System.Random(409);
            Physics.SyncTransforms();
            for(int i=0;i<42;i++)
            {
                float x=(float)rng.NextDouble()*14-7,z=-80+(float)rng.NextDouble()*185;
                if(Physics.Raycast(new Vector3(x,80,z),Vector3.down,out var hit,90,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                    Patch(root,hit.point+hit.normal*.015f,hit.normal,.4f+(float)rng.NextDouble()*1.4f,dryAsphalt,i);
            }
            // Side-street greenery and rubble stay outside the central combat avenue and rooftop posts.
            foreach(int side in new[]{-1,1})for(int i=0;i<8;i++)
            {
                Vector3 p=TerrainGenerator.OnGround(gm.Terrain,side*52f,-86+i*23f);
                if(Physics.CheckBox(p+Vector3.up*2,new Vector3(3,1.5f,3),Quaternion.identity,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))continue;
                Vegetation.Tree(root,p,.55f+(i%3)*.08f,Vegetation.TreeType.Broadleaf,rng);
                Vegetation.Bush(root,p+Vector3.forward*2,.35f,rng);
                for(int j=0;j<3;j++)Patch(root,p+new Vector3(j*.6f,.025f,-2),Vector3.up,.2f,stone,i+j);
            }
        }
        static void Patch(Transform parent,Vector3 point,Vector3 normal,float radius,Material material,int seed)
        {
            const int edges=11;var vertices=new Vector3[edges+1];var uv=new Vector2[edges+1];var triangles=new int[edges*3];
            uv[0]=Vector2.one*.5f;
            for(int i=0;i<edges;i++)
            {
                float angle=i*Mathf.PI*2/edges;
                float size=radius*(.76f+.24f*Mathf.PerlinNoise(i*.8f,seed*.4f));
                vertices[i+1]=new Vector3(Mathf.Cos(angle)*size,Mathf.Sin(angle)*size,0);
                uv[i+1]=new Vector2(vertices[i+1].x,vertices[i+1].y)*.5f+Vector2.one*.5f;
                triangles[i*3]=0;triangles[i*3+1]=i+1;triangles[i*3+2]=(i+1)%edges+1;
            }
            var mesh=new Mesh{name="Irregular ground patch"};mesh.vertices=vertices;mesh.uv=uv;mesh.triangles=triangles;mesh.RecalculateNormals();mesh.RecalculateBounds();
            var go=new GameObject("Ground wear",typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(parent,true);
            go.transform.SetPositionAndRotation(point,Quaternion.LookRotation(normal)*Quaternion.Euler(0,0,seed*37f));
            go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterial=material;
            go.AddComponent<OwnedHandMesh>();
        }
    }
}
