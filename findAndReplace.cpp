//For conversion of our happy-path.test.js into valid JS
#include <stdio.h>
#include <stdlib.h>
#include <sys/time.h>

#define STRING const char*
typedef struct {
    STRING find;
    STRING replace;
} macro;

//Increment MACRO_COUNT and add a new macro if you want to do more!
#define MACRO_COUNT 4
static macro macros[MACRO_COUNT] = {
    {"AP.", "await page."},
    {"APC(", "await wclick(page, "},
    {"wait_for_save", "(await waitForChangesToSave(page))"},
    {"server_data", "(await getUserServerData(page))"}
};

static int strlen(STRING str) {
    int count = 0;
    char * strw = (char*) str;
    while(*str) {
        str++;
        count++;
    }
    return count;
}

static char* getFileContents(STRING fileName){
    FILE *f = fopen(fileName, "r");
    //Gets the size of the file
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    fseek(f, 0, SEEK_SET);

    //Allots length + 1 for \0 room
    char * fileContent = (char*) malloc(fsize + 1);
    fread(fileContent, 1, fsize, f);
    fclose(f);
    fileContent[fsize] = 0;
    return fileContent;
}

static double getCurrentMicroseconds() {
        //For timing purposes
        struct timeval  tv;
        gettimeofday(&tv, NULL);
        double time_in_micro = (tv.tv_sec) * 1000000 + (tv.tv_usec);
        return time_in_micro;
}

static void writeFileContents(STRING outputPath, char * contents) {
    FILE * target = fopen("./build/happy-path.test.js", "w+" );
    fputs(contents, target);
    fclose(target);
}

int main() {


    char* contents = getFileContents("./happy-path.test.js");
    double startTime = getCurrentMicroseconds();
    int len = strlen(contents);
    //Plenty of padding
    char newContents[len*2];
    int contentMarker = 0;
    int contentLen = strlen(contents);

    while(*contents) {
        char current = *contents;
        int matched = 0;
        for(int i = 0; i < MACRO_COUNT; i++) {
            macro m = macros[i];

            int macroLength = strlen(m.find);
            if (contentLen < macroLength) {
                //Not enough space
                continue;
            }

            //See if matches current macro
            for (int j = 0; j < macroLength; j++) {
                if (m.find[j] == contents[j]) {
                    if(j == macroLength - 1) {
                        matched = 1;
                    }
                } else {
                    break;
                }
            }

            //Replace macro with text
            if (matched) {
               int replaceLength = strlen(m.replace);
               for(int j = 0; j < replaceLength; j++) {
                   newContents[contentMarker + j] = m.replace[j];
               }
               contentMarker += replaceLength;
               contents += macroLength;
               contentLen -= macroLength;
               break;
            }

        }
        if (!matched) {
                newContents[contentMarker] = contents[0];
                contentMarker++;
                contents++;
                contentLen--;
        }




    }

    newContents[contentMarker] = 0;

    writeFileContents("./build/happy-path.test.js", newContents);

    double finishedTime = getCurrentMicroseconds();
    printf("Microseconds: %5.0f\n", (finishedTime - startTime));

    printf("%d\n", len);

    return 0;
}

