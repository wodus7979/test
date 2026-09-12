using UnityEngine;
namespace SniperRidge
{
    public static class UrbanStreetDetails
    {
        public static void VaryFacade(GameObject building,int index)
        {
            Color[] tints={new Color(.86f,.84f,.78f),new Color(.78f,.83f,.82f),new Color(.89f,.88f,.83f),new Color(.80f,.77f,.73f)};
            var block=new MaterialPropertyBlock();
            foreach(var renderer in building.GetComponentsInChildren<Renderer>())
            {
                var materials=renderer.sharedMaterials;
                for(int i=0;i<materials.Length;i++)
                {
                    var material=materials[i];string name=material.name;
                    if(name!="Concrete"&&name!="Warm_Plaster"&&name!="Apartment_White"&&name!="AgedStone"&&name!="Industrial_Blue"&&name!="TownWall"&&name!="Roof_Metal")continue;
                    block.Clear();Color tint=material.color*tints[index%tints.Length];
                    if(name=="Industrial_Blue")tint=new Color(.38f,.43f,.43f);
                    if(name=="Roof_Metal"){tint=new Color(.32f,.35f,.35f);block.SetFloat("_GlossMapScale",.2f);}
                    block.SetColor("_Color",tint);block.SetColor("_BaseColor",tint);renderer.SetPropertyBlock(block,i);
                }
            }
        }
        public static void Build(Transform parent)
        {
            var root=new GameObject("Road repairs drains and street litter").transform;root.SetParent(parent,false);
            var asphalt=new Material(Resources.Load<Material>("CityPack/Materials/Asphalt")){color=new Color(.67f,.69f,.68f)};
            var iron=SurfaceDetail.Make(Surface.Steel,new Color(.12f,.13f,.13f),.12f,.6f);
            var paper=ProceduralAssets.LitMaterial(new Color(.49f,.46f,.38f),0);
            var concrete=Resources.Load<Material>("CityPack/Materials/Concrete");
            var random=new System.Random(27091);
            for(int street=-144;street<=144;street+=72)for(int z=-126;z<=126;z+=36)
            {
                var p=new Vector3(street,AssaultLayout.Ground+.014f,z);
                var cover=Piece(root,"Recessed iron manhole",p,new Vector3(.85f,.012f,.85f),iron,PrimitiveType.Cylinder);
                for(int i=-2;i<=2;i++)Piece(root,"Cover groove",p+new Vector3(0,.015f,i*.1f),new Vector3(.59f,.006f,.018f),asphalt);
                var patch=p+new Vector3((float)random.NextDouble()*3-1.5f,-.003f,7);
                Piece(root,"Dry road repair",patch,new Vector3(1.8f,.007f,3.1f),asphalt).localRotation=Quaternion.Euler(0,random.Next(-9,10),0);
                foreach(int side in new[]{-1,1})
                {
                    var drain=p+new Vector3(side*3.8f,.006f,4);
                    Piece(root,"Storm drain rim",drain,new Vector3(.38f,.015f,.7f),iron);
                    for(int bar=0;bar<6;bar++)Piece(root,"Drain ribs",drain+new Vector3(0,.012f,(bar-2.5f)*.10f),new Vector3(.33f,.008f,.03f),concrete);
                    for(int litter=0;litter<3;litter++)
                    {
                        var at=p+new Vector3(side*(3.5f+(float)random.NextDouble()*.3f),.005f,10+(float)random.NextDouble()*6);
                        Piece(root,"Discarded paper",at,new Vector3(.14f,.003f,.22f),paper).localRotation=Quaternion.Euler(0,random.Next(360),0);
                    }
                }
            }
            var owner=root.gameObject.AddComponent<UrbanDetailMaterials>();owner.Owned=new[]{asphalt,iron,paper};
        }
        static Transform Piece(Transform parent,string name,Vector3 p,Vector3 size,Material material,PrimitiveType type=PrimitiveType.Cube)
        {
            var go=GameObject.CreatePrimitive(type);go.name=name;go.transform.SetParent(parent,false);go.transform.position=p;go.transform.localScale=size;
            var collider=go.GetComponent<Collider>();collider.enabled=false;Object.Destroy(collider);
            go.GetComponent<Renderer>().sharedMaterial=material;return go.transform;
        }
    }
    public sealed class UrbanDetailMaterials:MonoBehaviour
    {
        public Material[] Owned;
        void OnDestroy(){if(Owned!=null)foreach(var material in Owned)if(material!=null)Destroy(material);}
    }
}
