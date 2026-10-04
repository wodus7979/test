using UnityEngine;
namespace SniperRidge
{
    public sealed class FpsWeaponHands:MonoBehaviour
    {
        Transform left,right,magazine,bolt,feed,lens,aimOccluder;
        Vector3 leftRest,rightRest,magRest,boltRest;
        Quaternion feedRest,magRotation;
        Quaternion supportRotation=Quaternion.Euler(-90,0,0);
        bool rocket,pump,looseRound,rifle;
        FpsGlovedHand leftGlove,rightGlove;
        FpsForearms forearms;
        public static FpsWeaponHands Attach(Transform weapon,WeaponDefinition definition)
        {
            var pose=weapon.gameObject.AddComponent<FpsWeaponHands>();pose.rocket=definition.IsRocket;
            pose.rifle=definition.ModelName=="03_assault_rifle";
            var rightMarker=WeaponModels.FindPart(weapon,"RightHand");var leftMarker=WeaponModels.FindPart(weapon,"LeftHand");
            Vector3 rightPosition=rightMarker!=null?weapon.InverseTransformPoint(rightMarker.position):new Vector3(0,-.047f,-.172f);
            Vector3 leftPosition=leftMarker!=null?weapon.InverseTransformPoint(leftMarker.position):new Vector3(0,.013f,.175f);
            // The authored palm already sits outboard of its grip origin. Keep the
            // origin at the mechanical marker so curved fingers wrap around the grip.
            rightPosition+=new Vector3(-.007f,-.015f,.003f);
            leftPosition+=new Vector3(.008f,-.008f,.005f);
            if(definition.ModelName=="03_assault_rifle")
            {
                // Cup the underside of the handguard instead of squeezing an imaginary vertical grip.
                leftPosition=new Vector3(.017f,-.004f,.175f);
                pose.supportRotation=Quaternion.Euler(-55,-8,18);
            }
            pose.right=Grip(weapon,"Trigger hand",rightPosition,1);
            pose.left=Grip(weapon,"Support and loading hand",leftPosition,-1);
            if(definition.Id=="pistol")pose.supportRotation=Quaternion.Euler(-12,0,0);
            pose.leftGlove=pose.left.GetComponentInChildren<FpsGlovedHand>();pose.rightGlove=pose.right.GetComponentInChildren<FpsGlovedHand>();
            if(definition.ModelName=="03_assault_rifle")pose.leftGlove.transform.localScale*=.9f;
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
            if(pose.magazine!=null){pose.magRest=weapon.InverseTransformPoint(pose.magazine.position);pose.magRotation=Quaternion.Inverse(weapon.rotation)*pose.magazine.rotation;}
            pose.bolt=WeaponModels.FindPart(weapon,"Pump");pose.pump=pose.bolt!=null;
            if(pose.bolt==null)pose.bolt=WeaponModels.FindPart(weapon,"ChargingHandle");
            if(pose.bolt==null)pose.bolt=WeaponModels.FindPart(weapon,"Slide");
            if(pose.bolt==null)pose.bolt=WeaponModels.FindPart(weapon,"Bolt");
            if(pose.bolt!=null)pose.boltRest=weapon.InverseTransformPoint(pose.bolt.position);
            pose.feed=WeaponModels.FindPart(weapon,"FeedCover");if(pose.feed!=null)pose.feedRest=pose.feed.localRotation;
            pose.lens=WeaponModels.FindPart(weapon,"Lens");
            // Legacy optical housings are closed display meshes and use the HUD sight.
            // The rebuilt rifle optic has an open bore and stays in view during ADS.
            pose.aimOccluder=WeaponModels.FindPart(weapon,"Optic");
            if(pose.aimOccluder==null)pose.aimOccluder=pose.lens;
            if(pose.rifle)pose.aimOccluder=null; // Open tube remains visible through the whole ADS transition.
            pose.forearms=FpsForearms.Create(weapon,pose.leftGlove.transform,pose.rightGlove.transform);
            pose.Pose(-1,-1);return pose;
        }
        void RifleReload(float t)
        {
            // Contact, extraction, exchange, insertion, bolt release, then support grip.
            // During extraction/insertion the palm and magazine share exactly the same pose.
            Vector3 gripOffset=new Vector3(.014f,-.022f,.008f);
            Vector3 outPosition=magRest+new Vector3(-.07f,-.17f,-.02f);
            Vector3 pouch=magRest+new Vector3(-.20f,-.34f,-.025f);
            Quaternion held=Quaternion.Euler(4,0,-8),magTilt=Quaternion.identity;
            Vector3 mag=magRest;
            if(t<.14f)
            {
                float q=Ease(t/.14f);
                left.localPosition=Vector3.Lerp(leftRest,magRest+gripOffset,q)+Vector3.left*(Mathf.Sin(q*Mathf.PI)*.045f);
                left.localRotation=Quaternion.Slerp(supportRotation,held,q);leftGlove.SetGrip(Mathf.Sin(q*Mathf.PI)*.6f,Mathf.Lerp(.30f,0,q));
            }
            else if(t<.76f)
            {
                if(t<.30f){float q=Ease((t-.14f)/.16f);mag=Vector3.Lerp(magRest,outPosition,q);magTilt=Quaternion.Euler(0,0,-12*q);}
                else if(t<.43f){mag=Vector3.Lerp(outPosition,pouch,Ease((t-.30f)/.13f));magTilt=Quaternion.Euler(0,0,-12);}
                else if(t<.51f){mag=pouch;magTilt=Quaternion.Euler(0,0,-12);}
                else if(t<.66f){float q=Ease((t-.51f)/.15f);mag=Vector3.Lerp(pouch,outPosition,q);magTilt=Quaternion.Euler(0,0,-12);}
                else {float q=Ease((t-.66f)/.10f);mag=Vector3.Lerp(outPosition,magRest,q);magTilt=Quaternion.Euler(0,0,-12*(1-q));}
                left.localPosition=mag+magTilt*gripOffset;left.localRotation=magTilt*held;leftGlove.SetOpen(0);
            }
            else
            {
                Vector3 latch=bolt!=null?boltRest+new Vector3(.017f,-.016f,0):magRest+gripOffset;
                float pull=Mathf.Sin(Mathf.Clamp01((t-.82f)/.09f)*Mathf.PI);
                if(bolt!=null)Position(bolt,boltRest+Vector3.back*pull*.055f);
                if(t<.82f){float q=Ease((t-.76f)/.06f);left.localPosition=Vector3.Lerp(magRest+gripOffset,latch,q);left.localRotation=Quaternion.Slerp(held,Quaternion.Euler(-18,0,0),q);leftGlove.SetOpen(Mathf.Sin(q*Mathf.PI)*.48f);}
                else if(t<.91f){left.localPosition=latch+Vector3.back*pull*.055f;left.localRotation=Quaternion.Euler(-18,0,0);leftGlove.SetOpen(.1f);}
                else {float q=Ease((t-.91f)/.09f);left.localPosition=Vector3.Lerp(latch,leftRest,q)+Vector3.left*(Mathf.Sin(q*Mathf.PI)*.035f);left.localRotation=Quaternion.Slerp(Quaternion.Euler(-18,0,0),supportRotation,q);leftGlove.SetGrip(Mathf.Sin(q*Mathf.PI)*.5f,.30f*q);}
            }
            Position(magazine,mag);magazine.rotation=transform.rotation*magRotation*magTilt;
            magazine.gameObject.SetActive(!(t>.43f&&t<.51f));
        }
        static Transform Grip(Transform parent,string name,Vector3 position,float side)
        {
            var grip=new GameObject(name).transform;grip.SetParent(parent,false);grip.localPosition=position;
            FpsGlovedHand.Create(grip,side);return grip;
        }
        static float Ease(float t)=>Mathf.SmoothStep(0,1,Mathf.Clamp01(t));
        void Position(Transform part,Vector3 weaponLocal)=>part.position=transform.TransformPoint(weaponLocal);
        public void SetAiming(bool aiming){if(aimOccluder!=null)aimOccluder.gameObject.SetActive(!aiming);}
        public void Pose(float reload,float cycling)
        {
            left.localPosition=leftRest;right.localPosition=rightRest;
            left.localRotation=supportRotation;right.localRotation=Quaternion.Euler(-12,0,0);
            leftGlove.SetGrip(0,rifle?.30f:0);rightGlove.SetOpen(0);
            if(magazine!=null){Position(magazine,magRest);magazine.rotation=transform.rotation*magRotation;magazine.gameObject.SetActive(!looseRound);}
            if(bolt!=null)Position(bolt,boltRest);
            if(feed!=null)feed.localRotation=feedRest;
            if(reload>=0&&rifle&&magazine!=null)RifleReload(Mathf.Clamp01(reload));
            else if(reload>=0)
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
            if(forearms!=null)forearms.UpdatePose();
        }
    }
}
