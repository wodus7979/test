using UnityEditor;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    public static class TankEscapeMotionImport
    {
        public static void Run()
        {
            EnemyMeleeDeathImport.Retarget("Assets/MutantCharacter/Source/Falling Flat Impact.fbx","Assets/Resources/Enemies/TankBlastFall.anim","TankBlastFall",true,true,true);
            EnemyMeleeDeathImport.Retarget("Assets/MutantCharacter/Source/Getting Up From Stomach.fbx","Assets/Resources/Enemies/TankGetUp.anim","TankGetUp",true,true,true);
            AssetDatabase.SaveAssets();Debug.Log("[Tank escape] Mixamo prone impact and native get-up imported onto the human skeleton.");
        }
    }
}
