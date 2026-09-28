using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Original articulated mesh, sculpted from ring profiles. No downloaded character asset.</summary>
    public sealed class HulkVisual : MonoBehaviour
    {
        readonly List<Mesh> meshes=new List<Mesh>();
        readonly List<Material> materials=new List<Material>();
        Transform torso,leftArm,rightArm,leftElbow,rightElbow,leftLeg,rightLeg,leftKnee,rightKnee;
        Renderer[] renderers;
        float stride;
        Material skin,pants,hair,eye,mouth;
        public static HulkVisual Create(Transform parent)
        {
            var go=new GameObject("Hulk • articulated body");go.layer=2;go.transform.SetParent(parent,false);
            var h=go.AddComponent<HulkVisual>();h.Build();return h;
        }
        Material Mat(Surface surface,Color color,float gloss)
        {var m=SurfaceDetail.Make(surface,color,gloss,0);materials.Add(m);return m;}
        Transform Joint(string name,Transform parent,Vector3 point)
        {var go=new GameObject(name);go.layer=2;go.transform.SetParent(parent,false);go.transform.localPosition=point;return go.transform;}
        void Build()
        {
            skin=Mat(Surface.Skin,new Color(.19f,.36f,.095f),.27f);
            pants=Mat(Surface.Fabric,new Color(.19f,.12f,.23f),.1f);
            hair=Mat(Surface.Fabric,new Color(.025f,.034f,.021f),.12f);
            eye=Mat(Surface.Skin,new Color(.75f,.78f,.55f),.32f);
            mouth=Mat(Surface.Skin,new Color(.035f,.045f,.018f),.12f);
            torso=Joint("Spine",transform,new Vector3(0,1.45f,0));
            // Radius profiles deliberately widen the lats and taper the waist.
            Profile("Torso sculpt",torso,Vector3.zero,new[]{.43f,.48f,.52f,.68f,.87f,.96f,.86f,.57f,.24f},
                new[]{.28f,.29f,.31f,.38f,.43f,.40f,.32f,.25f,.20f},1.40f,skin,true,false);
            for(int side=-1;side<=1;side+=2)
            {
                // Trapezius, scapula and pectorals are shallow reliefs integrated into the silhouette.
                Oval("Trapezius",torso,new Vector3(side*.29f,1.17f,-.08f),new Vector3(.40f,.22f,.21f),skin,new Vector3(0,0,side*-19));
                Oval("Pectoral",torso,new Vector3(side*.39f,.85f,.28f),new Vector3(.44f,.25f,.22f),skin);
                for(int i=0;i<3;i++)Oval("Abdominal",torso,new Vector3(side*.15f,.23f+i*.17f,.275f),new Vector3(.17f,.115f,.09f),skin);
            }
            var head=Joint("Neck and head",torso,new Vector3(0,1.25f,.035f));
            Oval("Neck",head,new Vector3(0,.07f,0),new Vector3(.24f,.26f,.23f),skin);
            Oval("Cranium",head,new Vector3(0,.35f,.02f),new Vector3(.29f,.35f,.27f),skin);
            Oval("Jaw",head,new Vector3(0,.20f,.16f),new Vector3(.245f,.21f,.18f),skin);
            Oval("Nose",head,new Vector3(0,.34f,.30f),new Vector3(.075f,.105f,.075f),skin);
            Oval("Mouth",head,new Vector3(0,.16f,.315f),new Vector3(.115f,.022f,.015f),mouth);
            for(int side=-1;side<=1;side+=2)
            {
                Oval("Ear",head,new Vector3(side*.29f,.32f,0),new Vector3(.07f,.115f,.07f),skin);
                Oval("Eye",head,new Vector3(side*.115f,.385f,.253f),new Vector3(.067f,.029f,.031f),eye);
                Oval("Iris",head,new Vector3(side*.115f,.383f,.28f),new Vector3(.019f,.022f,.012f),mouth);
                Oval("Heavy brow",head,new Vector3(side*.11f,.427f,.258f),new Vector3(.14f,.057f,.06f),skin,new Vector3(0,0,side*12));
            }
            Oval("Cropped hair",head,new Vector3(0,.55f,-.02f),new Vector3(.30f,.17f,.255f),hair);
            for(int i=0;i<14;i++)
            {
                float a=i*2.39996f;Oval("Hair locks",head,new Vector3(Mathf.Sin(a)*.21f,.62f+Mathf.Sin(i*1.7f)*.035f,Mathf.Cos(a)*.17f),new Vector3(.06f,.065f,.12f),hair,new Vector3(0,i*31,15));
            }
            Oval("Shorts waist",transform,new Vector3(0,1.42f,0),new Vector3(.51f,.30f,.34f),pants);
            for(int side=-1;side<=1;side+=2)
            {
                var arm=Joint(side<0?"Left shoulder":"Right shoulder",torso,new Vector3(side*.91f,1.02f,0));
                Oval("Deltoid",arm,Vector3.zero,new Vector3(.36f,.38f,.34f),skin);
                Profile("Upper arm",arm,new Vector3(0,-.77f,0),new[]{.20f,.27f,.32f,.32f,.28f,.22f},new[]{.21f,.29f,.32f,.31f,.26f,.22f},.79f,skin);
                var elbow=Joint("Elbow",arm,new Vector3(0,-.77f,0));
                Oval("Elbow joint",elbow,Vector3.zero,new Vector3(.215f,.22f,.22f),skin);
                Profile("Forearm",elbow,new Vector3(0,-.65f,0),new[]{.20f,.24f,.29f,.30f,.27f,.20f},new[]{.17f,.23f,.26f,.26f,.24f,.20f},.65f,skin);
                var fist=Joint("Fist",elbow,new Vector3(0,-.73f,.045f));
                Oval("Palm",fist,new Vector3(0,-.075f,0),new Vector3(.24f,.26f,.21f),skin);
                for(int finger=0;finger<4;finger++)
                {
                    float x=(finger-1.5f)*.103f;
                    Oval("Curled finger",fist,new Vector3(x,-.17f,.15f),new Vector3(.064f,.14f,.11f),skin);
                    Oval("Knuckle",fist,new Vector3(x,-.245f,.065f),new Vector3(.067f,.075f,.09f),skin);
                }
                Oval("Thumb",fist,new Vector3(-side*.21f,-.1f,.13f),new Vector3(.09f,.17f,.10f),skin,new Vector3(15,0,side*24));
                var leg=Joint(side<0?"Left hip":"Right hip",transform,new Vector3(side*.30f,1.42f,0));
                Profile("Ragged shorts",leg,new Vector3(0,-.61f,0),new[]{.28f,.32f,.34f,.35f,.33f,.29f},new[]{.29f,.33f,.34f,.33f,.30f,.28f},.68f,pants,false,true);
                var knee=Joint("Knee",leg,new Vector3(0,-.64f,0));
                Oval("Kneecap",knee,new Vector3(0,-.01f,.055f),new Vector3(.235f,.25f,.22f),skin);
                Profile("Calf",knee,new Vector3(0,-.59f,0),new[]{.12f,.15f,.22f,.24f,.21f,.18f},new[]{.15f,.19f,.24f,.25f,.22f,.19f},.58f,skin);
                Oval("Bare foot",knee,new Vector3(0,-.62f,.15f),new Vector3(.22f,.15f,.35f),skin);
                for(int toe=0;toe<5;toe++)Oval("Toe",knee,new Vector3((toe-2)*.075f,-.65f,.41f),new Vector3(.048f,.077f,.085f),skin);
                if(side<0){leftArm=arm;leftElbow=elbow;leftLeg=leg;leftKnee=knee;}
                else{rightArm=arm;rightElbow=elbow;rightLeg=leg;rightKnee=knee;}
            }
            renderers=GetComponentsInChildren<Renderer>();Pose(0,HulkController.Attack.None,0,true);
        }
        public void SetVisible(bool visible){foreach(var r in renderers)r.enabled=visible;}
        public void Pose(float speed,HulkController.Attack attack,float age,bool grounded)
        {
            stride+=Time.deltaTime*speed*1.45f;
            float walk=Mathf.Clamp01(speed/5),swing=Mathf.Sin(stride)*walk;
            torso.localRotation=Quaternion.Euler(grounded?4:14,Mathf.Sin(stride)*walk*4,0);
            torso.localPosition=new Vector3(0,1.45f+Mathf.Abs(Mathf.Sin(stride))*walk*.045f,0);
            leftLeg.localRotation=Quaternion.Euler(swing*28,0,-4);rightLeg.localRotation=Quaternion.Euler(-swing*28,0,4);
            leftKnee.localRotation=Quaternion.Euler(Mathf.Max(0,-swing)*30,0,0);rightKnee.localRotation=Quaternion.Euler(Mathf.Max(0,swing)*30,0,0);
            leftArm.localRotation=Quaternion.Euler(-swing*18-8,0,-12);rightArm.localRotation=Quaternion.Euler(swing*18-8,0,12);
            leftElbow.localRotation=rightElbow.localRotation=Quaternion.Euler(-15,0,0);
            if(attack==HulkController.Attack.Punch)
            {
                float punch=Mathf.Sin(Mathf.Clamp01(age/.58f)*Mathf.PI);
                rightArm.localRotation=Quaternion.Euler(-105*punch,15*punch,12);rightElbow.localRotation=Quaternion.Euler(-12-28*(1-punch),0,0);
                torso.localRotation=Quaternion.Euler(6,-18*punch,0);
            }
            if(attack==HulkController.Attack.Clap)
            {
                float close=Mathf.SmoothStep(0,1,Mathf.Clamp01((age-.18f)/.25f));
                float recover=1-Mathf.SmoothStep(0,1,Mathf.Clamp01((age-.65f)/.3f));
                leftArm.localRotation=Quaternion.Euler(-80*recover,43*close*recover,-(65*(1-close)+8)*recover);
                rightArm.localRotation=Quaternion.Euler(-80*recover,-43*close*recover,(65*(1-close)+8)*recover);
                leftElbow.localRotation=rightElbow.localRotation=Quaternion.Euler(-30*recover,0,0);
            }
            if(attack==HulkController.Attack.Slam)
            {
                float raised=grounded?Mathf.Clamp01(age/.55f):1;
                float armAngle=grounded?-55*(1-raised):-160;
                leftArm.localRotation=Quaternion.Euler(armAngle,0,-12);rightArm.localRotation=Quaternion.Euler(armAngle,0,12);
                if(!grounded){leftLeg.localRotation=Quaternion.Euler(-35,0,-7);rightLeg.localRotation=Quaternion.Euler(-25,0,7);leftKnee.localRotation=rightKnee.localRotation=Quaternion.Euler(65,0,0);}
                else{torso.localRotation=Quaternion.Euler(35*(1-raised),0,0);torso.localPosition+=Vector3.down*.22f*(1-raised);}
            }
        }
        void Oval(string name,Transform parent,Vector3 pos,Vector3 radii,Material mat,Vector3 rotation=default)
        {
            const int rings=16,sides=24;var vertices=new Vector3[(rings+1)*(sides+1)];var uv=new Vector2[vertices.Length];
            for(int j=0;j<=rings;j++)for(int i=0;i<=sides;i++)
            {float t=j*Mathf.PI/rings,a=i*Mathf.PI*2/sides;int k=j*(sides+1)+i;
                vertices[k]=new Vector3(Mathf.Sin(t)*Mathf.Cos(a)*radii.x,Mathf.Cos(t)*radii.y,Mathf.Sin(t)*Mathf.Sin(a)*radii.z);uv[k]=new Vector2((float)i/sides,(float)j/rings);}
            var tr=MeshObject(name,parent,pos,vertices,uv,Indices(rings,sides,false),mat);tr.localRotation=Quaternion.Euler(rotation);
        }
        void Profile(string name,Transform parent,Vector3 pos,float[] widths,float[] depths,float length,Material mat,bool sculpt=false,bool ragged=false)
        {
            const int rings=32,sides=48;var vertices=new Vector3[(rings+1)*(sides+1)];var uv=new Vector2[vertices.Length];
            for(int j=0;j<=rings;j++)for(int i=0;i<=sides;i++)
            {
                float t=(float)j/rings,a=i*Mathf.PI*2/sides;float index=t*(widths.Length-1);int n=Mathf.Min(widths.Length-2,(int)index);float f=index-n;
                float w=SmoothRadius(widths,n,f),d=SmoothRadius(depths,n,f);
                float x=Mathf.Cos(a)*w,z=Mathf.Sin(a)*d;
                if(sculpt)
                {
                    // Back relief: paired lats / shoulder blades and a narrow spine groove.
                    float back=Mathf.Max(0,-Mathf.Sin(a));
                    float muscle=Mathf.Exp(-Mathf.Pow((Mathf.Abs(x)-.37f)/.23f,2)-Mathf.Pow((t-.65f)/.23f,2))*.095f;
                    z-=back*(muscle-.025f*Mathf.Exp(-x*x/ .003f));
                }
                float y=t*length;
                if(ragged)y+=(1-t)*(1-t)*(.022f*Mathf.Sin(a*11)+.018f*Mathf.Cos(a*17));
                vertices[j*(sides+1)+i]=new Vector3(x,y,z);uv[j*(sides+1)+i]=new Vector2((float)i/sides,t);
            }
            MeshObject(name,parent,pos,vertices,uv,Indices(rings,sides,true),mat);
        }
        static float SmoothRadius(float[] values,int n,float t)
        {
            float a=values[Mathf.Max(0,n-1)],b=values[n],c=values[n+1],d=values[Mathf.Min(values.Length-1,n+2)];
            return .5f*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
        }
        static int[] Indices(int rings,int sides,bool outward)
        {
            var tri=new int[rings*sides*6];int k=0;
            for(int j=0;j<rings;j++)for(int i=0;i<sides;i++)
            {int a=j*(sides+1)+i,b=a+sides+1;tri[k++]=a;tri[k++]=b;tri[k++]=a+1;tri[k++]=a+1;tri[k++]=b;tri[k++]=b+1;}
            if(!outward)for(int i=0;i<tri.Length;i+=3){int t=tri[i];tri[i]=tri[i+1];tri[i+1]=t;}
            return tri;
        }
        Transform MeshObject(string name,Transform parent,Vector3 pos,Vector3[] v,Vector2[] uv,int[] tri,Material mat)
        {
            var mesh=new Mesh{name=name};mesh.vertices=v;mesh.uv=uv;mesh.triangles=tri;mesh.RecalculateNormals();mesh.RecalculateBounds();meshes.Add(mesh);
            var go=new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));go.layer=2;go.transform.SetParent(parent,false);go.transform.localPosition=pos;
            go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterial=mat;return go.transform;
        }
        void OnDestroy(){foreach(var mesh in meshes)Destroy(mesh);foreach(var mat in materials)Destroy(mat);}
    }
}
