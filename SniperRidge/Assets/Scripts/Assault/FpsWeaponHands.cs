using UnityEngine;
namespace SniperRidge
{
    public sealed class FpsWeaponHands:MonoBehaviour
    {
        Transform left,right,magazine,bolt,feed;
        Vector3 leftRest,rightRest,magRest,boltRest;
        Quaternion feedRest;
        Quaternion supportRotation=Quaternion.Euler(-90,0,0);
        bool rocket;
        public static FpsWeaponHands Attach(Transform weapon,WeaponDefinition definition)
        {
            var pose=weapon.gameObject.AddComponent<FpsWeaponHands>();pose.rocket=definition.IsRocket;
            float gripZ=definition.Id=="lmg"?-.211f:definition.Id=="sniper"?-.207f:-.172f;
            pose.right=Grip(weapon,"Trigger hand",pose.rocket?new Vector3(0,-.07f,-.02f):new Vector3(0,-.047f,gripZ),1);
            pose.left=Grip(weapon,"Support and loading hand",new Vector3(0,.013f,pose.rocket?.28f:.175f),-1);
            pose.leftRest=pose.left.localPosition;pose.rightRest=pose.right.localPosition;
            pose.magazine=weapon.Find("Magazine");if(pose.magazine==null)pose.magazine=weapon.Find("AmmoBox");
            if(pose.rocket)
            {
                var round=GameObject.CreatePrimitive(PrimitiveType.Capsule);round.name="Reload round";round.transform.SetParent(weapon,false);
                round.transform.localPosition=new Vector3(0,0,-.3f);round.transform.localScale=new Vector3(.07f,.17f,.07f);round.transform.localRotation=Quaternion.Euler(90,0,0);
                round.GetComponent<Collider>().enabled=false;
                if(Application.isPlaying)Destroy(round.GetComponent<Collider>());else DestroyImmediate(round.GetComponent<Collider>());
                round.GetComponent<Renderer>().sharedMaterial=ProceduralAssets.LitMaterial(new Color(.31f,.35f,.19f),.2f);
                pose.magazine=round.transform;
            }
            if(pose.magazine!=null)pose.magRest=pose.magazine.localPosition;
            pose.bolt=weapon.Find("Bolt");if(pose.bolt!=null)pose.boltRest=pose.bolt.localPosition;
            pose.feed=weapon.Find("FeedCover");if(pose.feed!=null)pose.feedRest=pose.feed.localRotation;
            pose.Pose(-1,-1);return pose;
        }
        static Transform Grip(Transform parent,string name,Vector3 position,float side)
        {
            var grip=new GameObject(name).transform;grip.SetParent(parent,false);grip.localPosition=position;
            GunnerHands.Build(grip,side,false);return grip;
        }
        static float Ease(float t)=>Mathf.SmoothStep(0,1,Mathf.Clamp01(t));
        public void Pose(float reload,float cycling)
        {
            left.localPosition=leftRest;right.localPosition=rightRest;
            left.localRotation=supportRotation;
            if(magazine!=null){magazine.localPosition=magRest;magazine.gameObject.SetActive(!rocket);}
            if(bolt!=null)bolt.localPosition=boltRest;
            if(feed!=null)feed.localRotation=feedRest;
            if(reload>=0)
            {
                float t=Mathf.Clamp01(reload);
                left.localRotation=Quaternion.Slerp(supportRotation,Quaternion.identity,t<.18f?Ease(t/.18f):t>.88f?1-Ease((t-.88f)/.12f):1);
                Vector3 grip=magRest+new Vector3(-.045f,0,0);
                Vector3 lowered=magRest+new Vector3(-.15f,-.20f,-.05f);
                Vector3 position=magRest;
                if(t<.18f)left.localPosition=Vector3.Lerp(leftRest,grip,Ease(t/.18f));
                else if(t<.4f){position=Vector3.Lerp(magRest,lowered,Ease((t-.18f)/.22f));left.localPosition=position+Vector3.left*.045f;}
                else if(t<.56f){position=lowered;left.localPosition=lowered+Vector3.left*.045f;}
                else if(t<.77f){position=Vector3.Lerp(lowered,magRest,Ease((t-.56f)/.21f));left.localPosition=position+Vector3.left*.045f;}
                else
                {
                    Vector3 latch=bolt!=null?boltRest+Vector3.left*.03f:grip;
                    left.localPosition=t<.88f?Vector3.Lerp(grip,latch,Ease((t-.77f)/.11f)):Vector3.Lerp(latch,leftRest,Ease((t-.88f)/.12f));
                    if(bolt!=null)bolt.localPosition=boltRest+Vector3.back*(Mathf.Sin(Mathf.Clamp01((t-.78f)/.15f)*Mathf.PI)*.065f);
                }
                if(magazine!=null)
                {
                    magazine.localPosition=position;
                    magazine.gameObject.SetActive(rocket?t>.16f&&t<.78f:!(t>.42f&&t<.55f));
                }
                if(feed!=null)
                {
                    float open=t<.15f?Ease(t/.15f):t>.77f?1-Ease((t-.77f)/.12f):1;
                    feed.localRotation=feedRest*Quaternion.Euler(-65f*open,0,0);
                }
            }
            else if(cycling>=0 && bolt!=null)
            {
                float action=Mathf.Sin(Mathf.Clamp01(cycling)*Mathf.PI);
                bolt.localPosition=boltRest+Vector3.back*action*.07f;
                right.localPosition=Vector3.Lerp(rightRest,bolt.localPosition+Vector3.right*.025f,action);
            }
        }
    }
}
