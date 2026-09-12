using System.IO;
using UnityEditor;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    public static class UrbanSurfaceAssets
    {
        public const int StoneSlot=24;
        const string Root="Assets/Resources/CityPack/Textures/";
        public static Texture2D Stone()
        {
            const string path="Assets/Resources/UrbanDetail/aged_limestone.png";
            AssetDatabase.ImportAsset(path,ImportAssetOptions.ForceSynchronousImport);Configure(path);
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }
        public static Texture2D Plaster()
        {
            const string path="Assets/Resources/UrbanDetail/aged_plaster.png";
            AssetDatabase.ImportAsset(path,ImportAssetOptions.ForceSynchronousImport);Configure(path);
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }
        public static Texture2D Windows()
        {
            const int size=512;var pixels=new Color[size*size];
            for(int y=0;y<size;y++)for(int x=0;x<size;x++)
            {
                float u=(x%256)/255f,v=(y%256)/255f;int variant=x/256+2*(y/256);
                float edge=Mathf.Clamp01(Mathf.Min(Mathf.Min(u,1-u),Mathf.Min(v,1-v))*22);
                float curtain=variant==0?Mathf.Sin(u*65)*.028f:variant==1?(Mathf.Repeat(v*22,1)<.12f?-.065f:.005f):variant==2?(u<.24f||u>.79f?.085f:-.045f):-.05f;
                float reflection=Mathf.SmoothStep(0,1,v)*.11f+Mathf.PerlinNoise(u*5+variant*17,v*8)*.045f;
                float shade=(.14f+curtain+reflection)*Mathf.Lerp(.32f,1,edge);
                pixels[y*size+x]=new Color(shade*.86f,shade*.97f,shade*1.06f,1);
            }
            return Save("window_atlas",pixels,size);
        }
        public static Texture2D Asphalt()
        {
            const int size=1024;var pixels=new Color[size*size];
            for(int y=0;y<size;y++)for(int x=0;x<size;x++)
            {
                float u=x/(float)size,v=y/(float)size;
                // Periodic harmonics produce a quiet large-scale surface without bright gravel speckles.
                float patch=Mathf.Sin(u*Mathf.PI*4)*Mathf.Cos(v*Mathf.PI*6)*.013f;
                uint seed=(uint)(x*374761393L+y*668265263L);seed=(seed^(seed>>13))*1274126177;
                float grain=(seed%1024)/1023f*.028f-.014f;
                float tone=.255f+patch+grain;
                pixels[y*size+x]=new Color(tone,tone*1.015f,tone*1.025f);
            }
            return Save("asphalt_urban",pixels,size);
        }
        static Texture2D Save(string name,Color[] pixels,int size)
        {
            var texture=new Texture2D(size,size,TextureFormat.RGB24,false);texture.SetPixels(pixels);texture.Apply();
            string path=Root+name+".png";File.WriteAllBytes(path,texture.EncodeToPNG());Object.DestroyImmediate(texture);
            AssetDatabase.ImportAsset(path,ImportAssetOptions.ForceSynchronousImport);Configure(path);
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }
        static void Configure(string path)
        {
            var importer=(TextureImporter)AssetImporter.GetAtPath(path);importer.sRGBTexture=true;importer.mipmapEnabled=true;
            importer.wrapMode=TextureWrapMode.Repeat;importer.filterMode=FilterMode.Trilinear;importer.anisoLevel=16;
            importer.maxTextureSize=2048;importer.textureCompression=TextureImporterCompression.CompressedHQ;importer.SaveAndReimport();
        }
    }
}
