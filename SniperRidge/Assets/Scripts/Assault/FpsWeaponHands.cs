using UnityEngine;
namespace SniperRidge
{
    public sealed class FpsWeaponHands:MonoBehaviour
    {
        Transform left,right,magazine,bolt,feed,lens;
        Vector3 leftRest,rightRest,magRest,boltRest;
        Quaternion feedRest;
        Quaternion supportRotation=Quaternion.Euler(-90,0,0);
        bool rocket,pump,looseRound;
        FpsGlovedHand leftGlove,rightGlove;
        public static FpsWeaponHands Attach(Transform weapon,WeaponDefinition definition)
        {
            var pose=weapon.gameObject.AddComponent<FpsWeaponHands>();pose.rocket=definition.IsRocket;
            var rightMarker=WeaponModels.FindPart(weapon,"RightHand");var leftMarker=WeaponModels.FindPart(weapon,"LeftHand");
            pose.right=Grip(weapon,"Trigger hand",rightMarker!=null?weapon.InverseTransformPoint(rightMarker.position):new Vector3(0,-.047f,-.172f),1);
            pose.left=Grip(weapon,"Support and loading hand",leftMarker!=null?weapon.InverseTransformPoint(leftMarker.position):new Vector3(0,.013f,.175f),-1);
            if(definition.Id=="pistol"||definition.ModelName=="03_assault_rifle")pose.supportRotation=Quaternion.Euler(-12,0,0);
            pose.leftGlove=pose.left.GetComponentInChildren<FpsGlovedHand>();pose.rightGlove=pose.right.GetComponentInChildren<FpsGlovedHand>();
            pose.leftRest=pose.left.localPosition;pose.rightRest=pose.right.localPosition;
            pose.magazine=WeaponModels.FindPart(weapon,"Magazine");if(pose.magazine==null)pose.magazine=WeaponModels.FindPart(weapon,"AmmoBox");
            pose.looseRound=pose.rocket||definition.Pellets>1;
            if(pose.looseRound)
            {
                var round=GameObject.CreatePrimitive(pose.rocket?PrimitiveType.Capsule:PrimitiveType.Cylinder);round.name="Reload round";round.transform.SetParent(weapon,false);
                round.transform.localPosition=pose.rocket?new Vector3(0,0,-.3f):new Vector3(0,.005f,-.10f);
                round.transform.localScale=pose.rocket?new Vector3(.07f,.17f,.07f):new Vector3(.022f,.032f,.022f);round.transform.localRotation=Quaternion.Euler(90,0,0);
                round.GetComponent<Collider>().enabled=false;
                if(Application.isPlaying)Destroy(round.GetComponent<Collider>());else DestroyImmediate(round.GetComponent<Collider>());
                round.GetComponent<Renderer>().sharedMaterial=ProceduralAssets.LitMaterial(pose.rocket?new Color(.31f,.35f,.19f):new Color(.54f,.16f,.07f),.2f);
                pose.magazine=round.transform;
            }
            if(pose.magazine!=null)pose.magRest=weapon.InverseTransformPoint(pose.magazine.position);
            pose.bolt=WeaponModels.FindPart(weapon,"Pump");pose.pump=pose.bolt!=null;
            if(pose.bolt==null)pose.bolt=WeaponModels.FindPart(weapon,"ChargingHandle");
            if(pose.bolt==null)pose.bolt=WeaponModels.FindPart(weapon,"Slide");
            if(pose.bolt==null)pose.bolt=WeaponModels.FindPart(weapon,"Bolt");
            if(pose.bolt!=null)pose.boltRest=weapon.InverseTransformPoint(pose.bolt.position);
            pose.feed=WeaponModels.FindPart(weapon,"FeedCover");if(pose.feed!=null)pose.feedRest=pose.feed.localRotation;
            pose.lens=WeaponModels.FindPart(weapon,"Lens");
            pose.Pose(-1,-1);return pose;
        }
        static Transform Grip(Transform parent,string name,Vector3 position,float side)
        {
            var grip=new GameObject(name).transform;grip.SetParent(parent,false);grip.localPosition=position;
            FpsGlovedHand.Create(grip,side);return grip;
        }
        static float Ease(float t)=>Mathf.SmoothStep(0,1,Mathf.Clamp01(t));
        void Position(Transform part,Vector3 weaponLocal)=>part.position=transform.TransformPoint(weaponLocal);
        public void SetAiming(bool aiming){if(lens!=null)lens.gameObject.SetActive(!aiming);}
        public void Pose(float reload,float cycling)
        {
            left.localPosition=leftRest;right.localPosition=rightRest;
            left.localRotation=supportRotation;right.localRotation=Quaternion.Euler(-12,0,0);
            leftGlove.SetOpen(0);rightGlove.SetOpen(0);
            if(magazine!=null){Position(magazine,magRest);magazine.gameObject.SetActive(!looseRound);}
            if(bolt!=null)Position(bolt,boltRest);
            if(feed!=null)feed.localRotation=feedRest;
            if(reload>=0)
            {
                float t=Mathf.Clamp01(reload);
                float reach=t<.18f?Mathf.Sin(t/.18f*Mathf.PI):t>.77f?Mathf.Sin((t-.77f)/.23f*Mathf.PI):.12f;
                leftGlove.SetOpen(reach*.70f);
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
                    if(bolt!=null)Position(bolt,boltRest+Vector3.back*(Mathf.Sin(Mathf.Clamp01((t-.78f)/.15f)*Mathf.PI)*.065f));
                }
                if(magazine!=null)
                {
                    Position(magazine,position);
                    magazine.gameObject.SetActive(looseRound?t>.16f&&t<.78f:!(t>.42f&&t<.55f));
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
                Position(bolt,boltRest+Vector3.back*action*.07f);
                if(pump)left.localPosition=leftRest+Vector3.back*action*.07f;
                else right.localPosition=Vector3.Lerp(rightRest,boltRest+Vector3.back*action*.07f+Vector3.right*.025f,action);
            }
        }
    }
}
