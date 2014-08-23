Open Rail Performance Index
===========================

##orpi-corpus

The objective of *orpi-corpus* is to save for reference the stations listed within [Network Rail Open Data (NROD) feeds](http://www.networkrail.co.uk/data-feeds/)'s reference ["corpus"](http://nrodwiki.rockshore.net/index.php/ReferenceData#CORPUS:_Location_Reference_Data). Stations are recognised from all other locations as they have both a 'STANOX' and '3ALPHA' code.

You need to have a Network Rail Open Data account for the script to work. Save your credentials either as environmnent variables (NROD_USERNAME and NROD_PASSWORD) or using an *.env* file and calling the script with:

    foreman run node main.js --out corpus-new.csv 

The data is also enriched by the location of the stations as resolved using Open Street Map's [Nominatim](http://wiki.openstreetmap.org/wiki/Nominatim) service. At the moment of writing, ~83% of points listed in the corpus have a match. Please note that Nominatim also requires you to state some degree of identity for your script by using dedicated content in the HTTP user agent header. Please read their full documentation. During development we used "orpi-corpus/0.0.1 (+https://github.com/theodi/orpi-corpus)". For the script to work, this must be available in the environment variable USER_AGENT.

Finally, the data is saved as a CSV file.

###Licence

The trains schedule and arrival data are sourced from the [Network Rail "Data Feeds" service](https://datafeeds.networkrail.co.uk). As a result, the data produced by *orpi-nrod-store* contains information of Network Rail Infrastructure Limited licensed under the following licence [http://www.networkrail.co.uk/data-feeds/terms-and-conditions/](http://www.networkrail.co.uk/data-feeds/terms-and-conditions/).

The stations' latitude and longitude is sourced from Open Street Map's [Nominatim](http://wiki.openstreetmap.org/wiki/Nominatim) service. Its data is provided under the [ODbL licence](http://opendatacommons.org/licenses/odbl/) which requires to share alike. Nominatim's full usage policy is described [here](http://wiki.openstreetmap.org/wiki/Nominatim_usage_policy).

![Creative Commons License](http://i.creativecommons.org/l/by-sa/4.0/88x31.png "Creative Commons License") This work, but for what is specified differently above, is licensed under a [Attribution-ShareAlike 4.0 International](http://creativecommons.org/licenses/by-sa/4.0/). 