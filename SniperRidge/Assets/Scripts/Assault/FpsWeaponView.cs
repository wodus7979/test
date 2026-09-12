using UnityEngine;
namespace SniperRidge
{
    // Keep the receiver in the lower-right quadrant; aiming alone brings it to the centre.
    public static class FpsWeaponView
    {
        public static Vector3 Offset(WeaponDefinition weapon,bool aiming)
        {
            if(aiming&&!weapon.IsRocket)return new Vector3(0,-.13f,.60f);
            if(weapon.IsRocket)return new Vector3(.32f,-.29f,.93f);
            if(weapon.Id=="lmg")return new Vector3(.30f,-.275f,.84f);
            if(weapon.Id=="sniper")return new Vector3(.26f,-.25f,.82f);
            return new Vector3(.27f,-.245f,.72f);
        }
        public static Quaternion Rotation(bool aiming,float lower)
            =>Quaternion.Euler(lower*22f,aiming?0:-5f,lower*-8f);
    }
}
