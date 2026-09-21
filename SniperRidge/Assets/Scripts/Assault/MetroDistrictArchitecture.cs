using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>Original modular architecture inspired by the layered skyline of Megacity.
    /// Reuses the town's collision shells and portals; it does not import Unity sample assets.</summary>
    public sealed class MetroDistrictArchitecture : MonoBehaviour
    {
        // Shared opaque surfaces: no transparent floors or expensive per-window lights.
        Material[] palette;
        Texture2D glazing;
        Material signText;
        readonly Dictionary<string, Mesh[]> cache = new Dictionary<string, Mesh[]>();
        readonly List<Mesh> owned = new List<Mesh>();
        const int Stone=0, Frame=1, Glass=2, WarmGlass=3, Copper=4, LightStrip=5, DarkGlass=6;

        public static MetroDistrictArchitecture Create(Transform parent)
        {
            var go=new GameObject("Metro district architecture");go.transform.SetParent(parent,false);
            var district=go.AddComponent<MetroDistrictArchitecture>();district.Initialize();return district;
        }
        void Initialize()
        {
            palette=new[] {
                Material("Precast limestone panels",new Color(.57f,.58f,.55f),.16f,0),
                Material("Graphite aluminium frames",new Color(.13f,.17f,.18f),.27f,.45f),
                Material("Opaque blue grey glazing",new Color(.23f,.36f,.42f),.38f,.28f),
                Material("Warm occupied windows",new Color(.43f,.36f,.24f),.24f,.12f),
                Material("Bronze facade fins",new Color(.40f,.27f,.16f),.28f,.5f),
                Material("Soft cyan signs",new Color(.20f,.49f,.52f),.2f,0),
                Material("Unlit window bays",new Color(.075f,.12f,.15f),.33f,.22f)
            };
            palette[Stone].mainTexture=Resources.Load<Texture2D>("CityPack/Textures/concrete_albedo");
            palette[Stone].SetTexture("_BumpMap",Resources.Load<Texture2D>("CityPack/Textures/concrete_normal_unity"));
            palette[Stone].SetFloat("_BumpScale",.035f);palette[Stone].EnableKeyword("_NORMALMAP");
            glazing=GlazingTexture();
            foreach(int slot in new[]{Glass,WarmGlass,DarkGlass})palette[slot].mainTexture=glazing;
            palette[WarmGlass].SetTexture("_EmissionMap",glazing);
            Emission(palette[WarmGlass],new Color(.35f,.23f,.11f));
            Emission(palette[LightStrip],new Color(.16f,.45f,.49f));
            signText=new Material(Resources.Load<Shader>("Shaders/MetroSignText"));
            RefreshFont(ProceduralAssets.UiFont);Font.textureRebuilt+=RefreshFont;
            BuildSkyline();BuildCrosswalks();
        }
        void RefreshFont(Font font)
        { if(signText!=null && font==ProceduralAssets.UiFont)signText.mainTexture=font.material.mainTexture; }
        static Texture2D GlazingTexture()
        {
            const int size=128;var pixels=new Color[size*size];
            for(int y=0;y<size;y++)for(int x=0;x<size;x++)
            {
                float u=x/(float)(size-1),v=y/(float)(size-1);
                float edge=Mathf.Clamp01(Mathf.Min(Mathf.Min(u,1-u),Mathf.Min(v,1-v))*28);
                float shade=Mathf.Lerp(.58f,.96f,v)*Mathf.Lerp(.60f,1,edge);
                if(v>.58f && y%6==0)shade*=.85f; // upper privacy blinds, softened by mipmaps
                shade+=Mathf.PerlinNoise(u*3,v*4)*.035f;
                pixels[y*size+x]=new Color(shade*.94f,shade*.98f,shade,1);
            }
            var texture=new Texture2D(size,size,TextureFormat.RGBA32,true){name="Metro opaque glazing depth",wrapMode=TextureWrapMode.Clamp,filterMode=FilterMode.Trilinear,anisoLevel=4};
            texture.SetPixels(pixels);texture.Apply(true,true);return texture;
        }
        static Material Material(string name,Color color,float gloss,float metal)
        {
            var mat=ProceduralAssets.LitMaterial(color,gloss);mat.name=name;
            if(mat.HasProperty("_Metallic"))mat.SetFloat("_Metallic",metal);return mat;
        }
        static void Emission(Material material,Color color)
        { material.EnableKeyword("_EMISSION");material.SetColor("_EmissionColor",color); }

        public void Replace(GameObject building,string asset,int index)
        {
            if(!asset.StartsWith("town_"))return;
            var boxes=building.GetComponentsInChildren<BoxCollider>();
            BoxCollider mass=null,floor=null,ceiling=null;
            foreach(var box in boxes)
            {
                if(box.name.StartsWith("structural_mass"))mass=box;
                if(box.name.StartsWith("floor"))floor=box;
                if(box.name.StartsWith("ceiling"))ceiling=box;
            }
            if(mass==null && (floor==null || ceiling==null))return;
            // The root renderer may contain the entire old model, including pitched roofs.
            // forceRenderingOff survives the world's distance visibility updates.
            foreach(var renderer in building.GetComponentsInChildren<Renderer>())renderer.forceRenderingOff=true;
            float width=mass!=null?mass.size.x:floor.size.x;
            float depth=mass!=null?mass.size.z:floor.size.z;
            float height=mass!=null?mass.center.y+mass.size.y*.5f:ceiling.center.y;
            string key=asset+"_"+(index%3);
            if(!cache.TryGetValue(key,out var meshes))
            {
                meshes=new Mesh[2];
                for(int lod=0;lod<2;lod++)
                {
                    var b=new Geometry(palette.Length);
                    // Render exactly the physical shells, including floors, interior walls and roof cover.
                    foreach(var box in boxes)
                    {
                        Vector3 centre=building.transform.InverseTransformPoint(box.transform.TransformPoint(box.center));
                        b.Box(centre,box.size,box.name.StartsWith("floor")?Frame:Stone);
                    }
                    Facade(b,width,depth,height,mass==null,index%3,lod==0);
                    meshes[lod]=b.Finish(key+" LOD"+lod);owned.Add(meshes[lod]);
                }
                cache.Add(key,meshes);
            }
            var root=new GameObject("Metro modular exterior");root.transform.SetParent(building.transform,false);
            var near=Render(root.transform,meshes[0],"Detailed facade");
            var far=Render(root.transform,meshes[1],"Distant facade");
            var group=root.AddComponent<LODGroup>();
            group.SetLODs(new[]{new LOD(.045f,new Renderer[]{near}),new LOD(.004f,new Renderer[]{far})});
            group.RecalculateBounds();
            if(mass==null)Sign(root.transform,new Vector3(-width*.27f,4.35f,-depth*.5f-.28f),index);
        }

        void Facade(Geometry b,float w,float d,float h,bool portal,int variant,bool detailed)
        {
            // Set-back glazing, projecting slab edges and paired corner fins give a real silhouette.
            for(int face=0;face<4;face++)
            {
                bool alongX=face<2;float span=alongX?w:d;
                var normal=alongX?new Vector3(0,0,face==0?-1:1):new Vector3(face==2?-1:1,0,0);
                var right=alongX?Vector3.right:Vector3.forward;
                Vector3 origin=normal*(alongX?d:w)*.5f;
                int columns=Mathf.Max(2,Mathf.FloorToInt(span/2.8f));float bay=span/columns;
                int floors=Mathf.Max(1,Mathf.FloorToInt(h/3.2f));float storey=h/floors;
                for(int row=0;row<floors;row++)for(int col=0;col<columns;col++)
                {
                    float x=-span*.5f+bay*(col+.5f),y=(row+.5f)*storey;
                    if(portal && alongX && row==0 && Mathf.Abs(x)<2f+bay*.5f)continue;
                    Vector3 p=origin+right*x+Vector3.up*y;
                    int glass=(col+row*3+variant*5+face)%9==0?WarmGlass:((col+row+variant)%4==0?DarkGlass:Glass);
                    b.Box(p+normal*.018f,Size(right,bay-.23f,storey*.70f,.07f),Frame);
                    b.Box(p+normal*.061f,Size(right,bay-.39f,storey*.61f,.026f),glass);
                    if(detailed)
                    {
                        b.Box(p+normal*.085f,Size(right,.045f,storey*.65f,.08f),Frame);
                        b.Box(p+normal*.10f-Vector3.up*(storey*.36f),Size(right,bay-.18f,.12f,.24f),Stone);
                        if((col+variant)%3==0)b.Box(p+right*(bay*.5f-.08f)+normal*.16f,Size(right,.09f,storey-.16f,.36f),variant==1?Copper:Stone);
                    }
                }
                for(int row=1;row<=floors;row++)
                    b.Box(origin+Vector3.up*(row*storey-.05f)+normal*.055f,Size(right,span+.10f,.18f,.20f),Frame);
                // Cladding joints and service louvers on solid end corners.
                foreach(int sign in new[]{-1,1})
                    b.Box(origin+right*(sign*(span*.5f-.13f))+Vector3.up*(h*.5f)+normal*.10f,Size(right,.22f,h,.25f),variant==2?Copper:Stone);
                if(portal && alongX)
                {
                    b.Box(origin+Vector3.up*3.48f+normal*.38f,Size(right,4.3f,.14f,.85f),Frame);
                    b.Box(origin+Vector3.up*3.35f+normal*.63f,Size(right,3.9f,.04f,.08f),LightStrip);
                }
                if(detailed)
                {
                    var ac=origin+right*(span*.33f)+Vector3.up*(h-.65f)+normal*.12f;
                    b.Box(ac,Size(right,1.2f,.75f,.18f),Frame);
                    for(int i=0;i<6;i++)b.Box(ac+Vector3.up*((i-2.5f)*.095f)+normal*.105f,Size(right,1.08f,.028f,.035f),Copper);
                }
            }
            // Roof trim stays within 20 cm of the original shell; roof firing positions stay clear.
            b.Box(new Vector3(0,h+.14f,0),new Vector3(w+.16f,.13f,d+.16f),Frame);
        }
        static Vector3 Size(Vector3 right,float width,float height,float depth)
            =>right.x!=0?new Vector3(width,height,depth):new Vector3(depth,height,width);
        MeshRenderer Render(Transform parent,Mesh mesh,string name)
        {
            var go=new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(parent,false);
            go.GetComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=go.GetComponent<MeshRenderer>();renderer.sharedMaterials=palette;return renderer;
        }
        void Sign(Transform parent,Vector3 p,int index)
        {
            var b=new Geometry(palette.Length);b.Box(p,new Vector3(5.6f,1.12f,.16f),Frame);
            b.Box(p+new Vector3(-2.55f,0,-.10f),new Vector3(.09f,.85f,.025f),LightStrip);
            var mesh=b.Finish("District sign panel");owned.Add(mesh);Render(parent,mesh,"Storefront panel");
            var go=new GameObject("District storefront name");go.transform.SetParent(parent,false);
            go.transform.localPosition=p+new Vector3(0,0,-.095f);go.transform.localRotation=Quaternion.identity;
            var text=go.AddComponent<TextMesh>();text.font=ProceduralAssets.UiFont;text.fontSize=64;text.characterSize=.10f;
            text.anchor=TextAnchor.MiddleCenter;text.alignment=TextAlignment.Center;text.color=new Color(.7f,.84f,.85f);
            text.text=new[]{"AXIS / WORKS","NORTH / DEPOT","METRO / 04","CIVIC / LAB","NEXUS / MARKET"}[index%5];
            go.GetComponent<MeshRenderer>().sharedMaterial=signText;
        }
        void BuildSkyline()
        {
            var rng=new System.Random(91023);
            for(int side=0;side<4;side++)for(int i=0;i<9;i++)
            {
                float along=-260+i*65+rng.Next(-12,13),away=220+rng.Next(0,65);
                var p=new Vector3(side<2?(side==0?-away:away):along,AssaultLayout.Ground,side>=2?(side==2?-away:away):along);
                float w=23+rng.Next(15),d=23+rng.Next(14),h=42+rng.Next(65);
                var b=new Geometry(palette.Length);float y=0;
                for(int tier=0;tier<3;tier++)
                {
                    float th=h*(tier==0?.45f:tier==1?.34f:.21f),tw=w*(1-tier*.17f),td=d*(1-tier*.15f);
                    b.Box(new Vector3(0,y+th*.5f,0),new Vector3(tw,th,td),Frame);
                    // Ribbon windows and structural fins break up the large masses at street distance.
                    for(float fy=y+2;fy<y+th-1;fy+=3.4f)
                    {
                        int mat=((int)fy+i)%7==0?WarmGlass:Glass;
                        b.Box(new Vector3(0,fy,0),new Vector3(tw+.06f,1.95f,td+.06f),mat);
                    }
                    for(float x=-tw*.5f+.5f;x<tw*.5f;x+=4.5f)
                        foreach(int z in new[]{-1,1})b.Box(new Vector3(x,y+th*.5f,z*(td*.5f+.09f)),new Vector3(.35f,th,.35f),Stone);
                    b.Box(new Vector3(0,y+th,0),new Vector3(tw+.6f,.7f,td+.6f),i%3==0?Copper:Stone);
                    y+=th;
                }
                var mesh=b.Finish("Tiered skyline tower");owned.Add(mesh);
                var r=Render(transform,mesh,"Backdrop tower");r.transform.localPosition=p;r.shadowCastingMode=ShadowCastingMode.Off;
                var lod=r.gameObject.AddComponent<LODGroup>();lod.SetLODs(new[]{new LOD(.008f,new Renderer[]{r})});lod.RecalculateBounds();
            }
        }
        void BuildCrosswalks()
        {
            // Coplanar-free thin markings, with no new blockers in the existing grid.
            var b=new Geometry(palette.Length);
            for(int x=-72;x<=72;x+=72)for(int z=-72;z<=72;z+=72)
            {
                for(int side=-1;side<=1;side+=2)for(int stripe=-3;stripe<=3;stripe++)
                {
                    b.Box(new Vector3(x+stripe*.9f,AssaultLayout.Ground+.024f,z+side*6.8f),new Vector3(.43f,.012f,2.4f),Stone);
                    b.Box(new Vector3(x+side*6.8f,AssaultLayout.Ground+.025f,z+stripe*.9f),new Vector3(2.4f,.012f,.43f),Stone);
                }
            }
            var mesh=b.Finish("District pedestrian crossings");owned.Add(mesh);Render(transform,mesh,"Crosswalk markings");
        }
        void OnDestroy()
        {
            foreach(var mesh in owned)if(mesh!=null)Destroy(mesh);
            if(glazing!=null)Destroy(glazing);
            Font.textureRebuilt-=RefreshFont;if(signText!=null)Destroy(signText);
            if(palette!=null)foreach(var material in palette)if(material!=null)Destroy(material);
        }
        sealed class Geometry
        {
            readonly List<Vector3> vertices=new List<Vector3>(),normals=new List<Vector3>();
            readonly List<Vector2> uv=new List<Vector2>();readonly List<int>[] triangles;
            public Geometry(int materials){triangles=new List<int>[materials];for(int i=0;i<materials;i++)triangles[i]=new List<int>();}
            public void Box(Vector3 centre,Vector3 size,int material)
            {
                foreach(var n in new[]{Vector3.right,Vector3.left,Vector3.up,Vector3.down,Vector3.forward,Vector3.back})
                {
                    var u=Vector3.Cross(Mathf.Abs(n.y)>.5f?Vector3.forward:Vector3.up,n).normalized;var v=Vector3.Cross(n,u);
                    int start=vertices.Count;int cornerIndex=0;
                    foreach(var corner in new[]{-u-v,u-v,u+v,-u+v})
                    {var p=centre+Vector3.Scale(n+corner,size)*.5f;vertices.Add(p);normals.Add(n);uv.Add(material==Glass||material==WarmGlass||material==DarkGlass ?
                        new Vector2(cornerIndex==1||cornerIndex==2?1:0,cornerIndex>=2?1:0):new Vector2(Vector3.Dot(p,u),Vector3.Dot(p,v)));cornerIndex++;}
                    foreach(var t in new[]{0,1,2,0,2,3})triangles[material].Add(start+t);
                }
            }
            public Mesh Finish(string name)
            {
                var mesh=new Mesh{name=name,indexFormat=vertices.Count>65535?IndexFormat.UInt32:IndexFormat.UInt16};
                mesh.SetVertices(vertices);mesh.SetNormals(normals);mesh.SetUVs(0,uv);mesh.subMeshCount=triangles.Length;
                for(int i=0;i<triangles.Length;i++)mesh.SetTriangles(triangles[i],i);mesh.RecalculateBounds();mesh.RecalculateTangents();return mesh;
            }
        }
    }
}
