using UnityEngine;
using UnityEngine.Rendering;
namespace SniperRidge
{
    public sealed class HulkWave : MonoBehaviour
    {
        LineRenderer line;
        Vector3 origin,forward,right;
        float radius,age;
        bool cone;
        public static void Create(Vector3 point,Vector3 direction,float range,bool directional)
        {
            var wave=new GameObject(directional?"Thunderclap pressure wave":"Ground slam shockwave").AddComponent<HulkWave>();
            wave.origin=point;wave.forward=direction;wave.right=Vector3.Cross(Vector3.up,direction);wave.radius=range;wave.cone=directional;
            wave.line=wave.gameObject.AddComponent<LineRenderer>();wave.line.sharedMaterial=Effects.Unlit(new Color(.65f,.92f,.7f));
            wave.line.positionCount=65;wave.line.useWorldSpace=true;wave.line.shadowCastingMode=ShadowCastingMode.Off;wave.line.receiveShadows=false;
            Effects.Puff(point,Vector3.up,directional?1.3f:2.5f,new Color(.52f,.5f,.39f),1f);
        }
        void Update()
        {
            age+=Time.deltaTime;if(age>=.9f||GameManager.Instance==null||!GameManager.Instance.IsPlaying){Destroy(gameObject);return;}
            float r=Mathf.Min(radius,age*radius/.8f);
            line.startWidth=line.endWidth=Mathf.Lerp(.21f,.01f,age/.9f);
            for(int i=0;i<65;i++)
            {
                float angle=(cone?Mathf.Lerp(-65,65,i/64f):i*360f/64)*Mathf.Deg2Rad;
                Vector3 p=origin+(forward*Mathf.Cos(angle)+right*Mathf.Sin(angle))*r;
                // Pressure flashes terminate at solid cover; damage uses the same visibility rule.
                if(Physics.Linecast(origin,p,out var hit,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)&&hit.collider.GetComponentInParent<EnemySoldier>()==null)p=hit.point;
                line.SetPosition(i,p);
            }
        }
        public static AudioClip MakeSound(bool wave)
        {
            const int rate=24000;float duration=wave?1.1f:.36f;var samples=new float[Mathf.CeilToInt(rate*duration)];var noise=new System.Random(wave?92:41);float low=0;
            for(int i=0;i<samples.Length;i++)
            {
                float t=i/(float)rate,n=(float)noise.NextDouble()*2-1;low=Mathf.Lerp(low,n,.16f);
                float body=Mathf.Sin(2*Mathf.PI*(wave?65:95)*t)*Mathf.Exp(-t*(wave?7:20));
                float crack=n*Mathf.Exp(-t*95),air=low*Mathf.Exp(-t*(wave?4:17));
                samples[i]=Mathf.Clamp((body*.48f+crack*.34f+air*.8f)*Mathf.Min(1,t*2500),-.95f,.95f);
            }
            var clip=AudioClip.Create(wave?"Hulk thunderclap":"Hulk fist impact",samples.Length,1,rate,false);clip.SetData(samples,0);return clip;
        }
    }
}
