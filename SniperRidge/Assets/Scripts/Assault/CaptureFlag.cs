using UnityEngine;
namespace SniperRidge
{
    public sealed class CaptureFlag:MonoBehaviour
    {
        Mesh mesh;Vector3[] rest,vertices;Material cloth;Transform banner;bool captured;
        public static CaptureFlag Create(Transform parent,Vector3 p,int number)
        {
            var root=new GameObject("Flag "+number);root.transform.SetParent(parent,false);root.transform.position=p;
            var flag=root.AddComponent<CaptureFlag>();
            var pole=GameObject.CreatePrimitive(PrimitiveType.Cylinder);pole.transform.SetParent(root.transform,false);
            pole.transform.localPosition=Vector3.up*1.9f;pole.transform.localScale=new Vector3(.06f,1.9f,.06f);
            pole.GetComponent<Collider>().enabled=false;Destroy(pole.GetComponent<Collider>());
            pole.GetComponent<Renderer>().sharedMaterial=ProceduralAssets.LitMaterial(new Color(.4f,.43f,.4f),.2f);
            var panel=new GameObject("Cloth",typeof(MeshFilter),typeof(MeshRenderer));flag.banner=panel.transform;
            panel.transform.SetParent(root.transform,false);panel.transform.localPosition=new Vector3(0,2.6f,0);
            flag.rest=new Vector3[52];var triangles=new int[144];
            for(int i=0;i<=12;i++)
            {
                flag.rest[i*2]=flag.rest[i*2+26]=new Vector3(i*.13f,0,0);
                flag.rest[i*2+1]=flag.rest[i*2+27]=new Vector3(i*.13f,.85f,0);
            }
            for(int i=0;i<12;i++)
            {
                int a=i*2,t=i*12;int[] f={a,a+1,a+2,a+2,a+1,a+3,a+28,a+27,a+26,a+29,a+27,a+28};
                for(int j=0;j<12;j++)triangles[t+j]=f[j];
            }
            flag.vertices=(Vector3[])flag.rest.Clone();flag.mesh=new Mesh{name="Flag cloth"};flag.mesh.vertices=flag.vertices;flag.mesh.triangles=triangles;flag.mesh.RecalculateNormals();
            panel.GetComponent<MeshFilter>().sharedMesh=flag.mesh;
            flag.cloth=ProceduralAssets.LitMaterial(new Color(.65f,.075f,.06f),.05f);panel.GetComponent<Renderer>().sharedMaterial=flag.cloth;
            return flag;
        }
        public void SetProgress(float progress){if(!captured)banner.localPosition=new Vector3(0,2.6f+.25f*progress,0);}
        public void Capture(){captured=true;cloth.color=new Color(.08f,.48f,.95f);banner.localPosition=new Vector3(0,2.9f,0);}
        void Update()
        {
            for(int i=0;i<vertices.Length;i++){vertices[i]=rest[i];vertices[i].z=Mathf.Sin(Time.time*3f+rest[i].x*5f)*.13f*rest[i].x;}
            mesh.vertices=vertices;mesh.RecalculateNormals();mesh.RecalculateBounds();
        }
        void OnDestroy(){if(mesh!=null)Destroy(mesh);if(cloth!=null)Destroy(cloth);}
    }
}
