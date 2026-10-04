using UnityEngine;
namespace SniperRidge
{
    // Keep the receiver in the lower-right quadrant; aiming alone brings it to the centre.
    public static class FpsWeaponView
    {
        // First-person framing only; world weapons retain their authored dimensions.
        public static float Scale(WeaponDefinition weapon)=>weapon.IsRocket||weapon.IsMounted||weapon.IsTank?1f:
            weapon.ModelName=="01_precision_rifle"?1.26f:1.32f;
        public static Vector3 Offset(WeaponDefinition weapon,bool aiming,Transform model=null)
        {
            if(aiming&&!weapon.IsRocket)
            {
                var sight=model!=null?model.Find("Body/SightLine"):null;
                if(sight!=null)
                {
                    Vector3 local=Vector3.Scale(model.InverseTransformPoint(sight.position),model.localScale);
                    return new Vector3(-local.x,-local.y,.46f-local.z);
                }
                return new Vector3(0,-.20f,.64f);
            }
            if(weapon.IsRocket)return new Vector3(.32f,-.40f,.96f);
            if(weapon.Id=="lmg")return new Vector3(.27f,-.45f,.83f);
            if(weapon.ModelName=="01_precision_rifle")return new Vector3(.26f,-.37f,.89f);
            if(weapon.Id=="pistol")return new Vector3(.21f,-.22f,.40f);
            if(weapon.Id=="smg")return new Vector3(.24f,-.28f,.68f);
            if(weapon.Id=="shotgun")return new Vector3(.24f,-.28f,.84f);
            return new Vector3(.25f,-.33f,.74f);
        }
        public static Quaternion Rotation(bool aiming,float lower)
            =>Quaternion.Euler(lower*22f,aiming?0:-5f,lower*-8f);
    }
}
