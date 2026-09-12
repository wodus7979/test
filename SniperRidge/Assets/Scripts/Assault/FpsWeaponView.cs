using UnityEngine;
namespace SniperRidge
{
    // Keep the receiver in the lower-right quadrant; aiming alone brings it to the centre.
    public static class FpsWeaponView
    {
        public static Vector3 Offset(WeaponDefinition weapon,bool aiming,Transform model=null)
        {
            if(aiming&&!weapon.IsRocket)
            {
                var sight=model!=null?model.Find("Body/SightLine"):null;
                if(sight!=null)
                {
                    Vector3 local=model.InverseTransformPoint(sight.position);
                    return new Vector3(-local.x,-local.y,.46f-local.z);
                }
                return new Vector3(0,-.20f,.64f);
            }
            if(weapon.IsRocket)return new Vector3(.32f,-.40f,.96f);
            if(weapon.Id=="lmg")return new Vector3(.30f,-.41f,.86f);
            if(weapon.ModelName=="01_precision_rifle")return new Vector3(.28f,-.35f,.86f);
            if(weapon.Id=="pistol")return new Vector3(.24f,-.23f,.46f);
            if(weapon.Id=="smg"||weapon.Id=="shotgun")return new Vector3(.27f,-.28f,.76f);
            return new Vector3(.28f,-.35f,.78f);
        }
        public static Quaternion Rotation(bool aiming,float lower)
            =>Quaternion.Euler(lower*22f,aiming?0:-5f,lower*-8f);
    }
}
